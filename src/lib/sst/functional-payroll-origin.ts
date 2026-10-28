import { z } from "zod";
import { createHash } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrPayrollRules, hrPayrollRuleSets, hrPayrollRubrics } from "@/db/schema/personnel-configuration";
import { payrollEvents } from "@/db/schema/personnel-workforce";
import { sstPlannedShifts } from "@/db/schema/sst-agenda";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { sstContextConnection, sstDatabase } from "./database";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { absenceMinutes } from "./certificate-policy";
import { SstValidationError } from "./errors";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { leaveMonetaryCalculation, leaveReversalMapping } from "./functional-leave-policy";

// Explicit value contract for a canonical RH CALCULO/JSON rule. Absence of this
// configuration is a blocker, never an implicit salary deduction by SST.
export const certificateLeaveRuleValue = z.object({
  originKind: z.literal("SST_CERTIFICATE_LEAVE"),
  employmentRegimeIds: z.array(z.string().min(1)).min(1), leaveTypes: z.array(z.string().min(1)).min(1),
  effect: z.enum(["NO_FINANCIAL_EFFECT", "CANONICAL_CALCULATION_REQUIRED"]),
  rubricId: z.string().optional(), eventId: z.string().optional(),
  calculation: leaveMonetaryCalculation.optional(), reversal: leaveReversalMapping.optional(),
}).strict().refine((v) => v.effect === "NO_FINANCIAL_EFFECT" || (!!v.rubricId && !!v.eventId), "Cálculo exige referências canônicas explícitas de rubrica e evento.");

export async function getAuthorizedCertificateLeaveOrigin(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ certificateId: z.string().min(1), competence: z.string().regex(/^(0[1-9]|1[0-2])\/(20\d{2}|[3-9]\d{3})$/), ruleId: z.string().optional() }).parse(raw);
  if (!canViewModule(context.user, "SST") || !canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Consulta da origem de afastamento exige SST e alteração RH.", 403);
  const [scope] = await sstRows<{ budgetUnitId: string }>(sstDatabase(context), sql`SELECT "budgetUnitId" FROM "SstMedicalCertificate" WHERE id=${input.certificateId}`);
  if (!scope) throw new SstValidationError("Atestado não encontrado.");
  assertBudgetUnitAccess(context.user, scope.budgetUnitId);
  const [month, year] = input.competence.split("/").map(Number);
  const from = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const until = new Date(`${next}-01T00:00:00-03:00`);
  return withDatabaseTransaction(connection, async (tx) => {
    // Shared with F7 canonical posting. Candidate creation itself never posts a monetary entry.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`);
    const [wire] = await sstRows<{ certificateId: string; employeeId: string; budgetUnitId: string; leaveId: string; leaveType: string; status: string; leaveStatus: string; startsAt: string; endsAt: string; functionalPeriodId: string; governmentEntityId: string; employmentRegimeId: string; ruleSetId: string; revisionId: string | null; assessmentId: string | null }>(tx, sql`SELECT c.id AS "certificateId",c."employeeId",c."budgetUnitId",c."leaveId",l.type AS "leaveType",c.status,l.status AS "leaveStatus",c."startsAt",c."endsAt",p.id AS "functionalPeriodId",p."governmentEntityId",p."employmentRegimeId",r."ruleSetId",v.id AS "revisionId",a.id AS "assessmentId" FROM "SstMedicalCertificate" c JOIN "Leave" l ON l.id=c."leaveId" AND l."employeeId"=c."employeeId" JOIN "SstCertificateFunctionalSource" f ON f."certificateId"=c.id JOIN "HrEmployeeFunctionalPeriod" p ON p.id=f."functionalPeriodId" AND p."employeeId"=c."employeeId" AND p."budgetUnitId"=c."budgetUnitId" JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId" JOIN "HrEmploymentRegime" r ON r.id=p."employmentRegimeId" LEFT JOIN LATERAL (SELECT id FROM "SstCertificateDecisionRevision" WHERE "certificateId"=c.id AND "newLeaveId"=l.id ORDER BY revision DESC LIMIT 1) v ON true LEFT JOIN LATERAL (SELECT id FROM "SstMedicalAssessment" WHERE "certificateId"=c.id AND decision='APPROVED' ORDER BY "assessedAt",id LIMIT 1) a ON true WHERE c.id=${input.certificateId} AND p."startsAt"<=c."startsAt" AND p."endsAt">=c."endsAt"`);
    const source = wire ? { ...wire, startsAt: sstTimestamp(wire.startsAt), endsAt: sstTimestamp(wire.endsAt) } : null;
    if (!source) throw new SstValidationError("Origem canônica histórica/afastamento ausente. Nenhum vínculo retroativo será inferido.");
    const blockers: string[] = [];
    if (source.status !== "APPROVED" || source.leaveStatus !== "Ativa") blockers.push("LEAVE_NOT_ACTIVE_APPROVED");
    if (!source.revisionId && !source.assessmentId) blockers.push("IMMUTABLE_DECISION_SOURCE_MISSING");
    const start = new Date(Math.max(from.getTime(), source.startsAt.getTime()));
    const end = new Date(Math.min(until.getTime(), source.endsAt.getTime()));
    if (start >= end) blockers.push("LEAVE_OUTSIDE_COMPETENCE");
    const payroll = await sstRows<{ id: string; status: string }>(tx, sql`SELECT p.id,p.status FROM "Payroll" p WHERE p.competence=${input.competence} AND EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i."payrollId"=p.id AND i."employeeId"=${source.employeeId})`);
    if (payroll.some((p) => ["Fechada", "Paga"].includes(p.status))) blockers.push("CLOSED_COMPETENCE_RECONCILIATION_REQUIRED");
    let configuration: { ruleId: string; ruleSetId: string; effect: string; rubricId: string | null; eventId: string | null; conditions: z.infer<typeof certificateLeaveRuleValue>; ruleValueHash: string } | null = null;
    if (!input.ruleId) blockers.push("REGIME_LEAVE_RULE_NOT_CONFIGURED");
    else {
      const [ruleRow] = await tx.select({ rule: hrPayrollRules, ruleSet: hrPayrollRuleSets }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(eq(hrPayrollRules.id, input.ruleId));
      const rule = ruleRow ? { ...ruleRow.rule, ruleSet: ruleRow.ruleSet } : null;
      const parsed = certificateLeaveRuleValue.safeParse(rule?.value);
      if (!rule?.isActive || rule.category !== "CALCULO" || rule.valueType !== "JSON" || !parsed.success) blockers.push("REGIME_LEAVE_RULE_INVALID");
      else {
        const policy = parsed.data;
        const set = rule.ruleSet;
        configuration = { ruleId: rule.id, ruleSetId: rule.ruleSetId, effect: policy.effect, rubricId: policy.rubricId || null, eventId: policy.eventId || null, conditions: policy, ruleValueHash: createHash("sha256").update(JSON.stringify(policy)).digest("hex") };
        if (!policy.employmentRegimeIds.includes(source.employmentRegimeId) || !policy.leaveTypes.includes(source.leaveType) || rule.ruleSetId !== source.ruleSetId) blockers.push("REGIME_LEAVE_RULE_SCOPE_MISMATCH");
        if (set.status !== "ATIVA" || set.scope !== "PRODUCAO" || set.isDemo || !set.approvedAt || set.approvedAt > new Date()) blockers.push("PRODUCTION_RULE_SET_NOT_APPROVED");
        if (set.effectiveFrom > from || (set.effectiveUntil && set.effectiveUntil < until)) blockers.push("RULE_SET_OUTSIDE_COMPETENCE");
        if (policy.effect === "CANONICAL_CALCULATION_REQUIRED") {
          const [rubric, event] = await Promise.all([tx.select().from(hrPayrollRubrics).where(eq(hrPayrollRubrics.id, policy.rubricId!)).then(rows => rows[0]), tx.select().from(payrollEvents).where(eq(payrollEvents.id, policy.eventId!)).then(rows => rows[0])]);
          if (!rubric?.isActive || rubric.ruleSetId !== rule.ruleSetId || !event?.isActive) blockers.push("CANONICAL_RUBRIC_EVENT_INVALID");
          if (!policy.calculation) blockers.push("APPROVED_MONETARY_CALCULATION_REQUIRED");
          else if (policy.calculation.legalReference !== rule.legalReference) blockers.push("MONETARY_LEGAL_REFERENCE_MISMATCH");
          // This endpoint remains a candidate contract; the transactional consumer posts the configured amount.
        }
      }
    }
    const planned = start < end ? await tx.select({ startsAt: sstPlannedShifts.startsAt, endsAt: sstPlannedShifts.endsAt }).from(sstPlannedShifts).where(and(eq(sstPlannedShifts.employeeId, source.employeeId), eq(sstPlannedShifts.budgetUnitId, source.budgetUnitId), lt(sstPlannedShifts.startsAt, end), gt(sstPlannedShifts.endsAt, start))) : [];
    const minutes = start < end ? absenceMinutes(planned.map((p) => ({ start: new Date(Math.max(p.startsAt.getTime(), start.getTime())), end: new Date(Math.min(p.endsAt.getTime(), end.getTime())) })), [{ start, end }]).absentMinutes : 0;
    if (!planned.length) blockers.push("PLANNED_SHIFT_SOURCE_MISSING");
    const originId = `${source.certificateId}:${source.revisionId || source.assessmentId}:${source.leaveId}:${input.competence}`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_CERTIFICATE_LEAVE_ORIGIN", targetId: source.certificateId });
    return { version: 1 as const, originKind: "SST_CERTIFICATE_LEAVE" as const, originId, certificateId: source.certificateId, assessmentId: source.assessmentId, revisionId: source.revisionId, leaveId: source.leaveId, employeeId: source.employeeId, budgetUnitId: source.budgetUnitId, governmentEntityId: source.governmentEntityId, employmentRegimeId: source.employmentRegimeId, functionalPeriodId: source.functionalPeriodId, competence: input.competence, attestedPlannedMinutes: minutes, configuration, blockers, status: "CANDIDATE_ONLY" as const, financialAmount: null, paymentStatus: "NOT_VERIFIED" as const };
  });
}
