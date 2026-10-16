import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { benefitDay, benefitCompetence, ExactDecimal } from "./benefit-policy";

export type BenefitPostingResult = { status: "POSTED" | "ALREADY_POSTED" | "BLOCKED"; entryId?: string; payrollItemId?: string; blockers: string[] };
const postingResult = z.object({ status: z.enum(["POSTED", "ALREADY_POSTED", "BLOCKED"]), entryId: z.string().optional(), payrollItemId: z.string().optional(), blockers: z.array(z.string()) });
class PostingBlocked extends Error {
  constructor(readonly result: BenefitPostingResult) { super(result.blockers.join(" · ")); }
}
function assertPosting(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Postagem financeira exige permissão de alteração RH.", 403);
}
async function authorizeEntry(tx: Prisma.TransactionClient, context: AppContext, entryId: string) {
  const rows = await tx.$queryRaw<{ budgetUnitId: string }[]>`SELECT p."budgetUnitId" FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "SstHealthPlan" p ON p.id=b."planId" WHERE e.id=${entryId}`;
  if (!rows[0]) throw new Error("Lançamento não encontrado.");
  assertBudgetUnitAccess(context.user, rows[0].budgetUnitId);
}
async function post(tx: Prisma.TransactionClient, context: AppContext, entryId: string, payrollId: string): Promise<BenefitPostingResult> {
  await authorizeEntry(tx, context, entryId);
  const [row] = await tx.$queryRaw<{ result: unknown }[]>`SELECT sst_post_benefit(${entryId},${payrollId},${randomUUID()},${context.user.id}) AS result`;
  return postingResult.parse(row.result);
}
export async function postBenefitEntry(context: AppContext, entryId: string, payrollId: string): Promise<BenefitPostingResult> {
  assertPosting(context);
  return context.prisma.$transaction((tx) => post(tx, context, entryId, payrollId));
}

// Preserves all unrelated canonical items; nothing is selected by event names.
export async function postBenefitPayrollBatch(context: AppContext, payrollId: string) {
  assertPosting(context);
  try {
    return await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`;
      const [payroll] = await tx.$queryRaw<{ competence: string; status: string }[]>`SELECT competence,status FROM "Payroll" WHERE id=${payrollId} FOR UPDATE`;
      if (!payroll) throw new PostingBlocked({ status: "BLOCKED", blockers: ["PAYROLL_NOT_FOUND"] });
      const [payrollScope] = await tx.$queryRaw<{ budgetUnitId: string }[]>`SELECT "budgetUnitId" FROM "SstBenefitPayrollScope" WHERE "payrollId"=${payrollId}`;
      if (!payrollScope) throw new PostingBlocked({ status: "BLOCKED", blockers: ["EXPLICIT_PAYROLL_UG_ENTITY_SCOPE_REQUIRED"] });
      assertBudgetUnitAccess(context.user, payrollScope.budgetUnitId);
      const scope = isSystemAdministrator(context.user) ? Prisma.sql`TRUE` : context.user.allowedBudgetUnitIds.length ? Prisma.sql`p."budgetUnitId" IN (${Prisma.join(context.user.allowedBudgetUnitIds)})` : Prisma.sql`FALSE`;
      const entries = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT e.id FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "SstHealthPlan" p ON p.id=b."planId" JOIN "SstBenefitPayrollScope" ps ON ps."payrollId"=${payrollId} AND ps."budgetUnitId"=p."budgetUnitId" WHERE e.competence=${payroll.competence} AND ${scope} ORDER BY CASE WHEN e.kind='REFUND' THEN 1 ELSE 0 END,e."createdAt",e.id`);
      if (!entries.length) throw new PostingBlocked({ status: "BLOCKED", blockers: ["NO_CANONICAL_ENTRIES_FOR_COMPETENCE"] });
      const results: BenefitPostingResult[] = [];
      for (const entry of entries) {
        const result = await post(tx, context, entry.id, payrollId);
        if (result.status === "BLOCKED") throw new PostingBlocked({ ...result, entryId: entry.id });
        results.push(result);
      }
      return { status: "POSTED" as const, blockers: [] as string[], results };
    }, { timeout: 30_000 });
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

export async function registerBenefitPayrollScope(context: AppContext, planId: string, payrollId: string) {
  assertPosting(context);
  return context.prisma.$transaction(async (tx) => {
    const plan = await tx.sstHealthPlan.findUniqueOrThrow({ where: { id: planId } });
    assertBudgetUnitAccess(context.user, plan.budgetUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`;
    const [mapping] = await tx.$queryRaw<{ governmentEntityId: string }[]>`SELECT "governmentEntityId" FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"=${plan.budgetUnitId}`;
    if (!mapping) throw new Error("UG exige mapeamento oficial de entidade no histórico RH.");
    const [existing] = await tx.$queryRaw<{ budgetUnitId: string; governmentEntityId: string }[]>`SELECT * FROM "SstBenefitPayrollScope" WHERE "payrollId"=${payrollId}`;
    if (existing) { if (existing.budgetUnitId !== plan.budgetUnitId || existing.governmentEntityId !== mapping.governmentEntityId) throw new Error("Folha já vinculada a outro escopo."); return payrollId; }
    const payroll = await tx.payroll.findUniqueOrThrow({ where: { id: payrollId } });
    benefitCompetence.parse(payroll.competence);
    await tx.$executeRaw`INSERT INTO "SstBenefitPayrollScope" ("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES (${payrollId},${plan.budgetUnitId},${mapping.governmentEntityId},${payroll.competence},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BENEFIT_PAYROLL_SCOPE", targetId: payrollId });
    return payrollId;
  });
}

export async function registerBenefitPayrollMapping(context: AppContext, raw: unknown) {
  assertPosting(context);
  const input = benefitPayrollMappingInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const plan = await tx.sstHealthPlan.findUniqueOrThrow({ where: { id: input.planId } });
    assertBudgetUnitAccess(context.user, plan.budgetUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_PAYROLL_MAPPING:${plan.id}`}))`;
    const rubrics = await tx.hrPayrollRubric.findMany({ where: { id: { in: [input.monthlyRubricId, input.extraordinaryRubricId, ...(input.refundRubricId ? [input.refundRubricId] : [])] } } });
    const events = await tx.payrollEvent.findMany({ where: { id: { in: [input.monthlyEventId, input.extraordinaryEventId, ...(input.refundEventId ? [input.refundEventId] : [])] } } });
    for (const [rubricId, eventId, refund] of [[input.monthlyRubricId, input.monthlyEventId, false], [input.extraordinaryRubricId, input.extraordinaryEventId, false], ...(input.refundRubricId ? [[input.refundRubricId, input.refundEventId, true]] : [])] as [string, string, boolean][]) {
      const rubric = rubrics.find((row) => row.id === rubricId); const event = events.find((row) => row.id === eventId);
      if (!rubric?.isActive || rubric.type !== (refund ? "PROVENTO" : "DESCONTO") || rubric.calculationMethod !== "MANUAL" || !event?.isActive || event.type !== (refund ? "Vencimento" : "Desconto") || event.formula?.trim()) throw new Error("Mapeamento deve usar rubrica MANUAL e evento explícito compatível com cobrança/crédito; valor vem somente da origem contratual.");
    }
    const [existing] = await tx.$queryRaw<(typeof input & { id: string })[]>`SELECT * FROM "SstBenefitPayrollMapping" WHERE "planId"=${plan.id} AND "startsAt"=${input.startsAt}::date`;
    if (existing) {
      const same = existing.endsAt.getTime() === input.endsAt.getTime() && ["monthlyRubricId", "monthlyEventId", "extraordinaryRubricId", "extraordinaryEventId", "refundRubricId", "refundEventId", "contractReference"].every((key) => existing[key as keyof typeof input] === input[key as keyof typeof input]);
      if (!same) throw new Error("Vigência do mapeamento já registrada com outros dados.");
      return existing.id;
    }
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "SstBenefitPayrollMapping" (id,"planId","startsAt","endsAt","monthlyRubricId","monthlyEventId","extraordinaryRubricId","extraordinaryEventId","refundRubricId","refundEventId","contractReference","createdById") VALUES (${id},${plan.id},${input.startsAt}::date,${input.endsAt}::date,${input.monthlyRubricId},${input.monthlyEventId},${input.extraordinaryRubricId},${input.extraordinaryEventId},${input.refundRubricId},${input.refundEventId},${input.contractReference},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BENEFIT_PAYROLL_MAPPING", targetId: id });
    return id;
  });
}

export async function cancelBenefitCharge(context: AppContext, raw: unknown): Promise<BenefitPostingResult> {
  assertPosting(context);
  const input = z.object({ entryId: z.string().min(1), payrollId: z.string().min(1), competence: benefitCompetence, reason: z.string().trim().min(10).max(1000) }).strict().parse(raw);
  try {
    return await context.prisma.$transaction(async (tx) => {
      await authorizeEntry(tx, context, input.entryId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`;
      const [existing] = await tx.$queryRaw<{ compensationEntryId: string; reason: string }[]>`SELECT "compensationEntryId",reason FROM "SstBenefitCancellation" WHERE "entryId"=${input.entryId}`;
      if (existing) {
        if (existing.reason !== input.reason) throw new Error("Cancelamento já registrado com outra justificativa.");
        return post(tx, context, existing.compensationEntryId, input.payrollId);
      }
      const [charge] = await tx.$queryRaw<{ beneficiaryId: string; amount: Prisma.Decimal; kind: string }[]>`SELECT "beneficiaryId",amount,kind FROM "SstBenefitEntry" WHERE id=${input.entryId} FOR UPDATE`;
      if (!charge || charge.kind === "REFUND") throw new Error("Cancelamento exige cobrança original.");
      const pending = await tx.$queryRaw<{ id: string }[]>`SELECT r.id FROM "SstBenefitEntry" r WHERE r."refundOfId"=${input.entryId} AND NOT EXISTS(SELECT 1 FROM "SstBenefitPayrollOrigin" o WHERE o."entryId"=r.id)`;
      if (pending.length) throw new PostingBlocked({ status: "BLOCKED", blockers: ["UNPOSTED_REFUNDS_REQUIRE_RECONCILIATION"] });
      const [refunded] = await tx.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT COALESCE(-SUM(amount),0) AS amount FROM "SstBenefitEntry" WHERE "refundOfId"=${input.entryId}`;
      const remaining = new ExactDecimal(charge.amount.toString()).minus(refunded.amount.toString());
      if (remaining.lte(0)) throw new PostingBlocked({ status: "BLOCKED", blockers: ["CHARGE_ALREADY_FULLY_REFUNDED"] });
      const id = randomUUID(); const amount = remaining.negated().toFixed(2);
      const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      await tx.$executeRaw`INSERT INTO "SstBenefitEntry" (id,"beneficiaryId",competence,kind,amount,"sourceReference",reason,"refundOfId","requestHash","candidateSnapshot","createdById") VALUES (${id},${charge.beneficiaryId},${input.competence},'REFUND',${amount}::numeric,${`CANCEL:${input.entryId}`},${input.reason},${input.entryId},${requestHash},${JSON.stringify({ category: charge.kind, cancellationOf: input.entryId })}::jsonb,${context.user.id})`;
      const result = await post(tx, context, id, input.payrollId);
      if (result.status === "BLOCKED") throw new PostingBlocked(result);
      await tx.$executeRaw`INSERT INTO "SstBenefitCancellation" (id,"entryId","compensationEntryId",reason,"createdById") VALUES (${`${id}:cancel`},${input.entryId},${id},${input.reason},${context.user.id})`;
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BENEFIT_CANCELLATION", targetId: `${id}:cancel` });
      return result;
    });
  } catch (error) { if (error instanceof PostingBlocked) return error.result; throw error; }
}
