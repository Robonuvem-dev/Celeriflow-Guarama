import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { registerCreditEventInTransaction } from "./s2-service";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { attributeItbiHistory } from "./itbi-history";

export const itbiExpiryPolicySchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), active: z.boolean(), overdueDays: z.number().int().min(1).max(3650), extinguishUnpaidAssessment: z.boolean(), legalBasis: z.string().trim().min(1).max(4000) });
async function authorize(tx: Prisma.TransactionClient, actor: TaxActor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await tx.planningEntityUnit.findFirst({ where: scope })) throw new Error("Origem não conciliada.");
}
export async function publishItbiExpiryPolicy(db: PrismaClient, actor: TaxActor, raw: z.input<typeof itbiExpiryPolicySchema>) {
  const input = itbiExpiryPolicySchema.parse(raw);
  return db.$transaction(async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_EXPIRY_POLICY:${input.budgetUnitId}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ITBI_EXPIRY_POLICY" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion || previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("Política alterada ou origem divergente. Recarregue.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ITBI_EXPIRY_POLICY", title: "Cancelamento de ITBI vencido", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_ITBI_EXPIRY_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, legalBasis: input.legalBasis } } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelOverdueItbiProcesses(db: PrismaClient, actor: TaxActor, raw: { governmentEntityId: string; budgetUnitId: string; expectedPolicyVersion: number }) {
  const input = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedPolicyVersion: z.number().int().positive() }).parse(raw);
  const policy = await db.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ITBI_EXPIRY_POLICY" }, orderBy: { version: "desc" } });
  const config = itbiExpiryPolicySchema.parse(policy.data);
  if (!config.active || policy.version !== input.expectedPolicyVersion || config.governmentEntityId !== input.governmentEntityId) throw new Error("Política inativa ou alterada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  const declarations = await db.itbiDeclaration.findMany({ where: { status: { in: ["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"] }, AND: [{ calculationSnapshot: { path: ["governmentEntityId"], equals: input.governmentEntityId } }, { calculationSnapshot: { path: ["budgetUnitId"], equals: input.budgetUnitId } }] }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const results: { id: string; status: string; detail?: string }[] = [];
  const date = new Date(); const cutoff = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - config.overdueDays));
  for (const { id } of declarations) {
    try {
      const status = await db.$transaction(async tx => {
        await attributeItbiHistory(tx, actor);
        await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
        const currentPolicy = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ITBI_EXPIRY_POLICY" }, orderBy: { version: "desc" } });
        if (currentPolicy.id !== policy.id) throw new Error("Política alterada durante o processamento.");
        const origin = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id } });
        if (origin.assessmentId) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${id} FOR UPDATE`;
        const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id } });
        if (declaration.assessmentId !== origin.assessmentId) throw new Error("Lançamento alterado durante o processamento.");
        if (!["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status) || declaration.cadastralUpdatedAt) return "PRESERVADO";
        const scope = taxScopeSnapshot(declaration.calculationSnapshot);
        if (scope.governmentEntityId !== input.governmentEntityId || scope.budgetUnitId !== input.budgetUnitId) throw new Error("Origem da declaração alterada.");
        const guides = declaration.assessmentId ? await tx.taxGuide.findMany({ where: { assessmentId: declaration.assessmentId, status: { not: "Cancelada" } }, orderBy: { dueDate: "desc" } }) : [];
        const dueDate = guides[0]?.dueDate ?? (typeof scope.dueDate === "string" ? new Date(`${scope.dueDate}T23:59:59.999Z`) : null);
        if (!dueDate || !Number.isFinite(dueDate.valueOf())) return "SEM_VENCIMENTO_CONCILIADO";
        if (dueDate >= cutoff) return "DENTRO_DO_PRAZO";
        if (declaration.assessmentId) {
          if (!config.extinguishUnpaidAssessment) return "CREDITO_PRESERVADO_PELA_POLITICA";
          if (await tx.taxPayment.count({ where: { guide: { assessmentId: declaration.assessmentId }, status: "Confirmado" } }) || (await taxAssessmentCompensatedValue(tx, declaration.assessmentId)).gt(0)) return "PAGAMENTO_OU_COMPENSACAO";
          const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: declaration.assessmentId } });
          if (["Pago", "Suspenso", "Dívida Ativa", "Cancelado", "Extinto"].includes(assessment.status)) return "CREDITO_INDISPONIVEL";
          for (const guide of guides) await tx.taxGuide.update({ where: { id: guide.id }, data: { status: "Cancelada" } });
          await registerCreditEventInTransaction(tx, actor, { assessmentId: assessment.id, eventType: "EXTINCAO_NAO_FINANCEIRA", reason: config.legalBasis, processId: declaration.processId ?? undefined, idempotencyKey: `ITBI_EXPIRY:${declaration.id}` });
          await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: "Cancelado" } });
        }
        if (declaration.documentId) await tx.document.update({ where: { id: declaration.documentId }, data: { status: "Revogado" } });
        await tx.itbiDeclaration.update({ where: { id }, data: { status: "CANCELADA", guideId: null, documentId: null, events: { create: { eventType: "CANCELAMENTO_AUTOMATICO", description: config.legalBasis, actorUsuarioId: actor.usuarioId, payload: { policyId: policy.id, dueDate: dueDate.toISOString(), overdueDays: config.overdueDays } } } } });
        await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: id, category: "ITBI_AUTOMATIC_CANCELLATION", title: "Cancelamento por vencimento", actorUsuarioId: actor.usuarioId, processId: declaration.processId, data: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, policyId: policy.id, policyVersion: policy.version, previousStatus: declaration.status, dueDate: dueDate.toISOString(), legalBasis: config.legalBasis, assessmentId: declaration.assessmentId, previousDocumentId: declaration.documentId } } });
        await tx.taxAuditLog.create({ data: { action: "CANCEL_OVERDUE_ITBI", entityType: "ItbiDeclaration", entityId: id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { policyId: policy.id, legalBasis: config.legalBasis } } });
        return "CANCELADA";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
      results.push({ id, status });
    } catch (error) { results.push({ id, status: "ERRO_SEM_ALTERACAO", detail: error instanceof Error ? error.message : "Falha no processamento" }); }
  }
  return { scanned: results.length, remaining: Math.max(0, declarations.length - results.length), cancelled: results.filter(row => row.status === "CANCELADA").length, results };
}
