import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { sstHealthPlans } from "@/db/schema/sst-benefits";
import { payrolls, payrollEvents } from "@/db/schema/personnel-workforce";
import { hrPayrollRubrics } from "@/db/schema/personnel-configuration";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { sstParameters } from "@/db/repositories/sst/scope";
import { sstContextConnection } from "./database";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { benefitDay, benefitCompetence, ExactDecimal } from "./benefit-policy";

export type BenefitPostingResult = { status: "POSTED" | "ALREADY_POSTED" | "BLOCKED"; entryId?: string; payrollItemId?: string; blockers: string[] };
const postingResult = z.object({ status: z.enum(["POSTED", "ALREADY_POSTED", "BLOCKED"]), entryId: z.string().optional(), payrollItemId: z.string().optional(), blockers: z.array(z.string()) });
class PostingBlocked extends Error {
  constructor(readonly result: BenefitPostingResult) { super(result.blockers.join(" · ")); }
}
function assertPosting(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Postagem financeira exige permissão de alteração RH.", 403);
}
async function authorizeEntry(tx: DatabaseTransaction, context: AppContext, entryId: string) {
  const rows = await sstRows<{ budgetUnitId: string }>(tx, sql`SELECT p."budgetUnitId" FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "SstHealthPlan" p ON p.id=b."planId" WHERE e.id=${entryId}`);
  if (!rows[0]) throw new Error("Lançamento não encontrado.");
  assertBudgetUnitAccess(context.user, rows[0].budgetUnitId);
}
async function post(tx: DatabaseTransaction, context: AppContext, entryId: string, payrollId: string): Promise<BenefitPostingResult> {
  await authorizeEntry(tx, context, entryId);
  const [row] = await sstRows<{ result: unknown }>(tx, sql`SELECT sst_post_benefit(${entryId},${payrollId},${randomUUID()},${context.user.id}) AS result`);
  return postingResult.parse(row.result);
}
export async function postBenefitEntry(context: AppContext, entryId: string, payrollId: string, connection: DatabaseConnection = sstContextConnection(context)): Promise<BenefitPostingResult> {
  assertPosting(context);
  return withDatabaseTransaction(connection, (tx) => post(tx, context, entryId, payrollId));
}

// Preserves all unrelated canonical items; nothing is selected by event names.
export async function postBenefitPayrollBatch(context: AppContext, payrollId: string, connection: DatabaseConnection = sstContextConnection(context)) {
  assertPosting(context);
  try {
    return await withDatabaseTransaction(connection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`);
      const [payroll] = await sstRows<{ competence: string; status: string }>(tx, sql`SELECT competence,status FROM "Payroll" WHERE id=${payrollId} FOR UPDATE`);
      if (!payroll) throw new PostingBlocked({ status: "BLOCKED", blockers: ["PAYROLL_NOT_FOUND"] });
      const [payrollScope] = await sstRows<{ budgetUnitId: string }>(tx, sql`SELECT "budgetUnitId" FROM "SstBenefitPayrollScope" WHERE "payrollId"=${payrollId}`);
      if (!payrollScope) throw new PostingBlocked({ status: "BLOCKED", blockers: ["EXPLICIT_PAYROLL_UG_ENTITY_SCOPE_REQUIRED"] });
      assertBudgetUnitAccess(context.user, payrollScope.budgetUnitId);
      const scope = isSystemAdministrator(context.user) ? sql`TRUE` : context.user.allowedBudgetUnitIds.length ? sql`p."budgetUnitId" IN (${sstParameters(context.user.allowedBudgetUnitIds)})` : sql`FALSE`;
      const entries = await sstRows<{ id: string }>(tx, sql`SELECT e.id FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "SstHealthPlan" p ON p.id=b."planId" JOIN "SstBenefitPayrollScope" ps ON ps."payrollId"=${payrollId} AND ps."budgetUnitId"=p."budgetUnitId" WHERE e.competence=${payroll.competence} AND ${scope} ORDER BY CASE WHEN e.kind='REFUND' THEN 1 ELSE 0 END,e."createdAt",e.id`);
      if (!entries.length) throw new PostingBlocked({ status: "BLOCKED", blockers: ["NO_CANONICAL_ENTRIES_FOR_COMPETENCE"] });
      const results: BenefitPostingResult[] = [];
      for (const entry of entries) {
        const result = await post(tx, context, entry.id, payrollId);
        if (result.status === "BLOCKED") throw new PostingBlocked({ ...result, entryId: entry.id });
        results.push(result);
      }
      return { status: "POSTED" as const, blockers: [] as string[], results };
    }, { timeoutMs: 30_000 });
  } catch (error) { if (error instanceof PostingBlocked) return error.result; throw error; }
}

export const benefitPayrollMappingInput = z.object({
  planId: z.string().min(1), startsAt: benefitDay, endsAt: benefitDay,
  monthlyRubricId: z.string().min(1), monthlyEventId: z.string().min(1),
  extraordinaryRubricId: z.string().min(1), extraordinaryEventId: z.string().min(1),
  refundRubricId: z.string().optional().transform((value) => value || null),
  refundEventId: z.string().optional().transform((value) => value || null),
  contractReference: z.string().trim().min(3).max(500),
}).strict().refine((value) => value.startsAt <= value.endsAt && value.monthlyRubricId !== value.extraordinaryRubricId && value.monthlyEventId !== value.extraordinaryEventId && !!value.refundRubricId === !!value.refundEventId, "Vigência e pares distintos de rubricas/eventos são obrigatórios.");

export async function registerBenefitPayrollScope(context: AppContext, planId: string, payrollId: string, connection: DatabaseConnection = sstContextConnection(context)) {
  assertPosting(context);
  return withDatabaseTransaction(connection, async (tx) => {
    const [plan] = await tx.select().from(sstHealthPlans).where(eq(sstHealthPlans.id, planId));
    if (!plan) throw new Error("Plano não encontrado.");
    assertBudgetUnitAccess(context.user, plan.budgetUnitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`);
    const [mapping] = await sstRows<{ governmentEntityId: string }>(tx, sql`SELECT "governmentEntityId" FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"=${plan.budgetUnitId}`);
    if (!mapping) throw new Error("UG exige mapeamento oficial de entidade no histórico RH.");
    const [existing] = await sstRows<{ budgetUnitId: string; governmentEntityId: string }>(tx, sql`SELECT * FROM "SstBenefitPayrollScope" WHERE "payrollId"=${payrollId}`);
    if (existing) { if (existing.budgetUnitId !== plan.budgetUnitId || existing.governmentEntityId !== mapping.governmentEntityId) throw new Error("Folha já vinculada a outro escopo."); return payrollId; }
    const [payroll] = await tx.select().from(payrolls).where(eq(payrolls.id, payrollId));
    if (!payroll) throw new Error("Folha não encontrada.");
    benefitCompetence.parse(payroll.competence);
    await tx.execute(sql`INSERT INTO "SstBenefitPayrollScope" ("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES (${payrollId},${plan.budgetUnitId},${mapping.governmentEntityId},${payroll.competence},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BENEFIT_PAYROLL_SCOPE", targetId: payrollId });
    return payrollId;
  });
}

export async function registerBenefitPayrollMapping(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertPosting(context);
  const input = benefitPayrollMappingInput.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const [plan] = await tx.select().from(sstHealthPlans).where(eq(sstHealthPlans.id, input.planId));
    if (!plan) throw new Error("Plano não encontrado.");
    assertBudgetUnitAccess(context.user, plan.budgetUnitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_PAYROLL_MAPPING:${plan.id}`}))`);
    const rubrics = await tx.select().from(hrPayrollRubrics).where(inArray(hrPayrollRubrics.id, [input.monthlyRubricId, input.extraordinaryRubricId, ...(input.refundRubricId ? [input.refundRubricId] : [])]));
    const events = await tx.select().from(payrollEvents).where(inArray(payrollEvents.id, [input.monthlyEventId, input.extraordinaryEventId, ...(input.refundEventId ? [input.refundEventId] : [])]));
    for (const [rubricId, eventId, refund] of [[input.monthlyRubricId, input.monthlyEventId, false], [input.extraordinaryRubricId, input.extraordinaryEventId, false], ...(input.refundRubricId ? [[input.refundRubricId, input.refundEventId, true]] : [])] as [string, string, boolean][]) {
      const rubric = rubrics.find((row) => row.id === rubricId); const event = events.find((row) => row.id === eventId);
      if (!rubric?.isActive || rubric.type !== (refund ? "PROVENTO" : "DESCONTO") || rubric.calculationMethod !== "MANUAL" || !event?.isActive || event.type !== (refund ? "Vencimento" : "Desconto") || event.formula?.trim()) throw new Error("Mapeamento deve usar rubrica MANUAL e evento explícito compatível com cobrança/crédito; valor vem somente da origem contratual.");
    }
    const [existingWire] = await sstRows<Omit<typeof input, "startsAt" | "endsAt"> & { id: string; startsAt: string; endsAt: string }>(tx, sql`SELECT * FROM "SstBenefitPayrollMapping" WHERE "planId"=${plan.id} AND "startsAt"=${input.startsAt}::date`);
    const existing = existingWire ? { ...existingWire, startsAt: sstTimestamp(existingWire.startsAt), endsAt: sstTimestamp(existingWire.endsAt) } : null;
    if (existing) {
      const same = existing.endsAt.getTime() === input.endsAt.getTime() && ["monthlyRubricId", "monthlyEventId", "extraordinaryRubricId", "extraordinaryEventId", "refundRubricId", "refundEventId", "contractReference"].every((key) => existing[key as keyof typeof input] === input[key as keyof typeof input]);
      if (!same) throw new Error("Vigência do mapeamento já registrada com outros dados.");
      return existing.id;
    }
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO "SstBenefitPayrollMapping" (id,"planId","startsAt","endsAt","monthlyRubricId","monthlyEventId","extraordinaryRubricId","extraordinaryEventId","refundRubricId","refundEventId","contractReference","createdById") VALUES (${id},${plan.id},${input.startsAt}::date,${input.endsAt}::date,${input.monthlyRubricId},${input.monthlyEventId},${input.extraordinaryRubricId},${input.extraordinaryEventId},${input.refundRubricId},${input.refundEventId},${input.contractReference},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BENEFIT_PAYROLL_MAPPING", targetId: id });
    return id;
  });
}

export async function cancelBenefitCharge(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)): Promise<BenefitPostingResult> {
  assertPosting(context);
  const input = z.object({ entryId: z.string().min(1), payrollId: z.string().min(1), competence: benefitCompetence, reason: z.string().trim().min(10).max(1000) }).strict().parse(raw);
  try {
    return await withDatabaseTransaction(connection, async (tx) => {
      await authorizeEntry(tx, context, input.entryId);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`);
      const [existing] = await sstRows<{ compensationEntryId: string; reason: string }>(tx, sql`SELECT "compensationEntryId",reason FROM "SstBenefitCancellation" WHERE "entryId"=${input.entryId}`);
      if (existing) {
        if (existing.reason !== input.reason) throw new Error("Cancelamento já registrado com outra justificativa.");
        return post(tx, context, existing.compensationEntryId, input.payrollId);
      }
      const [charge] = await sstRows<{ beneficiaryId: string; amount: string; kind: string }>(tx, sql`SELECT "beneficiaryId",amount::text AS amount,kind FROM "SstBenefitEntry" WHERE id=${input.entryId} FOR UPDATE`);
      if (!charge || charge.kind === "REFUND") throw new Error("Cancelamento exige cobrança original.");
      const pending = await sstRows<{ id: string }>(tx, sql`SELECT r.id FROM "SstBenefitEntry" r WHERE r."refundOfId"=${input.entryId} AND NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" o WHERE o."entryId"=r.id)`);
      if (pending.length) throw new PostingBlocked({ status: "BLOCKED", blockers: ["UNPOSTED_REFUNDS_REQUIRE_RECONCILIATION"] });
      const [refunded] = await sstRows<{ amount: string }>(tx, sql`SELECT COALESCE(-SUM(amount),0)::text AS amount FROM "SstBenefitEntry" WHERE "refundOfId"=${input.entryId}`);
      const remaining = new ExactDecimal(charge.amount.toString()).minus(refunded.amount.toString());
      if (remaining.lte(0)) throw new PostingBlocked({ status: "BLOCKED", blockers: ["CHARGE_ALREADY_FULLY_REFUNDED"] });
      const id = randomUUID(); const amount = remaining.negated().toFixed(2);
      const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      await tx.execute(sql`INSERT INTO "SstBenefitEntry" (id,"beneficiaryId",competence,kind,amount,"sourceReference",reason,"refundOfId","requestHash","candidateSnapshot","createdById") VALUES (${id},${charge.beneficiaryId},${input.competence},'REFUND',${amount}::numeric,${`CANCEL:${input.entryId}`},${input.reason},${input.entryId},${requestHash},${JSON.stringify({ category: charge.kind, cancellationOf: input.entryId })}::jsonb,${context.user.id})`);
      const result = await post(tx, context, id, input.payrollId);
      if (result.status === "BLOCKED") throw new PostingBlocked(result);
      await tx.execute(sql`INSERT INTO "SstBenefitCancellation" (id,"entryId","compensationEntryId",reason,"createdById") VALUES (${`${id}:cancel`},${input.entryId},${id},${input.reason},${context.user.id})`);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BENEFIT_CANCELLATION", targetId: `${id}:cancel` });
      return result;
    });
  } catch (error) { if (error instanceof PostingBlocked) return error.result; throw error; }
}
