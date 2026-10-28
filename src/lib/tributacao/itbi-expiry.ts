import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { documents } from "@/db/schema/registry";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { itbiDeclarations } from "@/db/schema/tax-itbi";
import { auditItbi, insertItbiRegistryEntry, latestItbiRegistryEntry, lockItbiKey, lockItbiRecord, readConfirmedItbiPayments, readItbiAssessment, readItbiDeclaration, readItbiMunicipalUnit, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { registerCreditEventInTransaction } from "./s2-service";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { attributeItbiHistory } from "./itbi-history";

export const itbiExpiryPolicySchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), active: z.boolean(), overdueDays: z.number().int().min(1).max(3650), extinguishUnpaidAssessment: z.boolean(), legalBasis: z.string().trim().min(1).max(4000) });
async function authorize(tx: DatabaseTransaction, actor: TaxActor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await readItbiMunicipalUnit(tx, scope)) throw new Error("Origem não conciliada.");
}
export async function publishItbiExpiryPolicy(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof itbiExpiryPolicySchema>) {
  const input = itbiExpiryPolicySchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    await lockItbiKey(tx, `ITBI_EXPIRY_POLICY:${input.budgetUnitId}`);
    const previous = await latestItbiRegistryEntry(tx, "BUDGET_UNIT", input.budgetUnitId, "ITBI_EXPIRY_POLICY");
    if ((previous?.version ?? 0) !== input.expectedVersion || previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("Política alterada ou origem divergente. Recarregue.");
    const entry = await insertItbiRegistryEntry(tx, { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ITBI_EXPIRY_POLICY", title: "Cancelamento de ITBI vencido", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } });
    await auditItbi(tx, { action: "PUBLISH_ITBI_EXPIRY_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, legalBasis: input.legalBasis } });
    return entry;
  }, { isolationLevel: "serializable" });
}

export async function cancelOverdueItbiProcesses(connection: DatabaseConnection, actor: TaxActor, raw: { governmentEntityId: string; budgetUnitId: string; expectedPolicyVersion: number }) {
  const db = connection.db;
  const input = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedPolicyVersion: z.number().int().positive() }).parse(raw);
  const policy = requireItbiRecord(await latestItbiRegistryEntry(db, "BUDGET_UNIT", input.budgetUnitId, "ITBI_EXPIRY_POLICY"));
  const config = itbiExpiryPolicySchema.parse(policy.data);
  if (!config.active || policy.version !== input.expectedPolicyVersion || config.governmentEntityId !== input.governmentEntityId) throw new Error("Política inativa ou alterada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  const declarations = await db.select({ id: itbiDeclarations.id }).from(itbiDeclarations).where(and(inArray(itbiDeclarations.status, ["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"]), sql`${itbiDeclarations.calculationSnapshot}->'governmentEntityId' = ${JSON.stringify(input.governmentEntityId)}::jsonb`, sql`${itbiDeclarations.calculationSnapshot}->'budgetUnitId' = ${JSON.stringify(input.budgetUnitId)}::jsonb`)).orderBy(asc(itbiDeclarations.createdAt));
  const results: { id: string; status: string; detail?: string }[] = [];
  const date = new Date(); const cutoff = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - config.overdueDays));
  for (const { id } of declarations) {
    try {
      const status = await withDatabaseTransaction(connection, async tx => {
        await attributeItbiHistory(tx, actor);
        await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
        const currentPolicy = requireItbiRecord(await latestItbiRegistryEntry(tx, "BUDGET_UNIT", input.budgetUnitId, "ITBI_EXPIRY_POLICY"));
        if (currentPolicy.id !== policy.id) throw new Error("Política alterada durante o processamento.");
        const origin = await readItbiDeclaration(tx, id);
        if (origin.assessmentId) await lockItbiRecord(tx, "TaxAssessment", origin.assessmentId);
        await lockItbiRecord(tx, "ItbiDeclaration", id);
        const declaration = await readItbiDeclaration(tx, id);
        if (declaration.assessmentId !== origin.assessmentId) throw new Error("Lançamento alterado durante o processamento.");
        if (!["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status) || declaration.cadastralUpdatedAt) return "PRESERVADO";
        const scope = taxScopeSnapshot(declaration.calculationSnapshot);
        if (scope.governmentEntityId !== input.governmentEntityId || scope.budgetUnitId !== input.budgetUnitId) throw new Error("Origem da declaração alterada.");
        const guides = declaration.assessmentId ? await tx.select().from(taxGuides).where(and(eq(taxGuides.assessmentId, declaration.assessmentId), ne(taxGuides.status, "Cancelada"))).orderBy(desc(taxGuides.dueDate)) : [];
        const dueDate = guides[0]?.dueDate ?? (typeof scope.dueDate === "string" ? new Date(`${scope.dueDate}T23:59:59.999Z`) : null);
        if (!dueDate || !Number.isFinite(dueDate.valueOf())) return "SEM_VENCIMENTO_CONCILIADO";
        if (dueDate >= cutoff) return "DENTRO_DO_PRAZO";
        if (declaration.assessmentId) {
          if (!config.extinguishUnpaidAssessment) return "CREDITO_PRESERVADO_PELA_POLITICA";
          if ((await readConfirmedItbiPayments(tx, declaration.assessmentId)).length || (await taxAssessmentCompensatedValue(tx, declaration.assessmentId)).gt(0)) return "PAGAMENTO_OU_COMPENSACAO";
          const assessment = await readItbiAssessment(tx, declaration.assessmentId);
          if (["Pago", "Suspenso", "Dívida Ativa", "Cancelado", "Extinto"].includes(assessment.status)) return "CREDITO_INDISPONIVEL";
          for (const guide of guides) requireItbiRecord((await tx.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, guide.id)).returning({ id: taxGuides.id }))[0]);
          await registerCreditEventInTransaction(tx, actor, { assessmentId: assessment.id, eventType: "EXTINCAO_NAO_FINANCEIRA", reason: config.legalBasis, processId: declaration.processId ?? undefined, idempotencyKey: `ITBI_EXPIRY:${declaration.id}` });
          requireItbiRecord((await tx.update(taxAssessments).set({ status: "Cancelado" }).where(eq(taxAssessments.id, assessment.id)).returning({ id: taxAssessments.id }))[0]);
        }
        if (declaration.documentId) requireItbiRecord((await tx.update(documents).set({ status: "Revogado" }).where(eq(documents.id, declaration.documentId)).returning({ id: documents.id }))[0]);
        await updateItbiDeclaration(tx, id, { status: "CANCELADA", guideId: null, documentId: null }, { eventType: "CANCELAMENTO_AUTOMATICO", description: config.legalBasis, actorUsuarioId: actor.usuarioId, payload: { policyId: policy.id, dueDate: dueDate.toISOString(), overdueDays: config.overdueDays } });
        await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: id, category: "ITBI_AUTOMATIC_CANCELLATION", title: "Cancelamento por vencimento", actorUsuarioId: actor.usuarioId, processId: declaration.processId, data: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, policyId: policy.id, policyVersion: policy.version, previousStatus: declaration.status, dueDate: dueDate.toISOString(), legalBasis: config.legalBasis, assessmentId: declaration.assessmentId, previousDocumentId: declaration.documentId } });
        await auditItbi(tx, { action: "CANCEL_OVERDUE_ITBI", entityType: "ItbiDeclaration", entityId: id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { policyId: policy.id, legalBasis: config.legalBasis } });
        return "CANCELADA";
      }, { isolationLevel: "serializable", timeoutMs: 60000 });
      results.push({ id, status });
    } catch (error) { results.push({ id, status: "ERRO_SEM_ALTERACAO", detail: error instanceof Error ? error.message : "Falha no processamento" }); }
  }
  return { scanned: results.length, remaining: Math.max(0, declarations.length - results.length), cancelled: results.filter(row => row.status === "CANCELADA").length, results };
}
