import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { sstBeneficiaries, sstBenefitEntries, sstHealthPlans, sstBenefitConfigs, sstPayrollBenefits } from "@/db/schema/sst-benefits";
import { employees } from "@/db/schema/administration";
import { dependents } from "@/db/schema/personnel-records";
import { findSstBenefitBeneficiary } from "@/db/repositories/sst/benefits";
import { sstUnitFilter, sstParameters } from "@/db/repositories/sst/scope";
import { sstRows } from "@/db/repositories/sst/sql";
import { assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { benefitCompetence, competenceInterval, ExactDecimal, summarizeBenefitLedger } from "./benefit-policy";
import { sstDatabase } from "./database";

export async function listBenefitBeneficiaries(context: AppContext, params: { q?: string; page?: string }, portal = false) {
  if (portal && !context.user.employeeId) return { total: 0, page: 1, rows: [] };
  const database = sstDatabase(context), q = (params.q ?? "").trim().slice(0, 120);
  const where = and(portal ? eq(sstPayrollBenefits.employeeId, context.user.employeeId!) : sstUnitFilter(context, sql`${sstHealthPlans.budgetUnitId}`), q ? sql`(${employees.name} ILIKE ${`%${q}%`} OR ${sstBenefitConfigs.name} ILIKE ${`%${q}%`})` : undefined);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstBeneficiaries).innerJoin(sstHealthPlans, eq(sstHealthPlans.id, sstBeneficiaries.planId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).innerJoin(employees, eq(employees.id, sstPayrollBenefits.employeeId)).innerJoin(sstBenefitConfigs, eq(sstBenefitConfigs.id, sstHealthPlans.benefitConfigId)).where(where);
  const requested = Number(params.page), page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await database.select({ beneficiary: sstBeneficiaries, plan: sstHealthPlans, benefitName: sstBenefitConfigs.name, payrollBenefit: sstPayrollBenefits, employeeName: employees.name, registration: employees.registration, dependent: { name: dependents.name } }).from(sstBeneficiaries).innerJoin(sstHealthPlans, eq(sstHealthPlans.id, sstBeneficiaries.planId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).innerJoin(employees, eq(employees.id, sstPayrollBenefits.employeeId)).innerJoin(sstBenefitConfigs, eq(sstBenefitConfigs.id, sstHealthPlans.benefitConfigId)).leftJoin(dependents, eq(dependents.id, sstBeneficiaries.dependentId)).where(where).orderBy(desc(sstBeneficiaries.createdAt), asc(sstBeneficiaries.id)).limit(20).offset((page - 1) * 20);
  return { total, page, rows: records.map(row => ({ ...row.beneficiary, plan: { ...row.plan, benefitConfig: { name: row.benefitName } }, payrollBenefit: { ...row.payrollBenefit, employee: { name: row.employeeName, registration: row.registration } }, dependent: row.dependent })) };
}

export async function readBenefitStatement(context: AppContext, id: string, params: { from: string; to: string; page?: string }, portal = false) {
  const from = benefitCompetence.parse(params.from), to = benefitCompetence.parse(params.to);
  const first = competenceInterval(from).start, last = competenceInterval(to).start;
  const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth();
  if (months < 0 || months > 119) throw new Error("Selecione período de até 120 competências em ordem cronológica.");
  const database = sstDatabase(context);
  const allowed = await database.select({ id: sstBeneficiaries.id }).from(sstBeneficiaries).innerJoin(sstHealthPlans, eq(sstHealthPlans.id, sstBeneficiaries.planId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).where(and(eq(sstBeneficiaries.id, id), portal ? eq(sstPayrollBenefits.employeeId, context.user.employeeId ?? "NO_EMPLOYEE") : sstUnitFilter(context, sql`${sstHealthPlans.budgetUnitId}`))).limit(1);
  if (!allowed.length) return null;
  const beneficiary = await findSstBenefitBeneficiary(database, id);
  if (!beneficiary) return null;
  if (!portal) assertBudgetUnitAccess(context.user, beneficiary.plan.budgetUnitId);
  const competences = Array.from({ length: months + 1 }, (_, index) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
    return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  });
  // All periods of this canonical employee assignment, including titular/dependents.
  const where = and(eq(sstBeneficiaries.planId, beneficiary.planId), eq(sstPayrollBenefits.employeeId, beneficiary.payrollBenefit.employeeId), inArray(sstBenefitEntries.competence, competences));
  const totals = await database.select({ beneficiaryId: sstBenefitEntries.beneficiaryId, competence: sstBenefitEntries.competence, kind: sstBenefitEntries.kind, amount: sql<string>`sum(${sstBenefitEntries.amount})::text` }).from(sstBenefitEntries).innerJoin(sstBeneficiaries, eq(sstBeneficiaries.id, sstBenefitEntries.beneficiaryId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).where(where).groupBy(sstBenefitEntries.beneficiaryId, sstBenefitEntries.competence, sstBenefitEntries.kind);
  const summary = summarizeBenefitLedger(totals.map(row => ({ ...row, amount: new ExactDecimal(row.amount) }))).sort((left, right) => competenceInterval(left.competence).start.getTime() - competenceInterval(right.competence).start.getTime() || left.beneficiaryId.localeCompare(right.beneficiaryId));
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstBenefitEntries).innerJoin(sstBeneficiaries, eq(sstBeneficiaries.id, sstBenefitEntries.beneficiaryId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).where(where);
  const requested = Number(params.page), page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const entryRows = await database.select({ entry: sstBenefitEntries, beneficiary: sstBeneficiaries, dependent: { name: dependents.name } }).from(sstBenefitEntries).innerJoin(sstBeneficiaries, eq(sstBeneficiaries.id, sstBenefitEntries.beneficiaryId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).leftJoin(dependents, eq(dependents.id, sstBeneficiaries.dependentId)).where(where).orderBy(desc(sstBenefitEntries.createdAt), asc(sstBenefitEntries.id)).limit(20).offset((page - 1) * 20);
  const entries = entryRows.map(row => ({ ...row.entry, beneficiary: { ...row.beneficiary, dependent: row.dependent } }));
  const beneficiaries = await database.select({ id: sstBeneficiaries.id, snapshot: sstBeneficiaries.snapshot, dependentId: sstBeneficiaries.dependentId, cardNumber: sstBeneficiaries.cardNumber }).from(sstBeneficiaries).where(inArray(sstBeneficiaries.id, [...new Set(summary.map(row => row.beneficiaryId))]));
  const origins = entries.length ? await sstRows<{ entryId: string; payrollItemId: string; payrollId: string; status: string }>(database, sql`SELECT o."entryId",o."payrollItemId",i."payrollId",p.status FROM "SstBenefitPayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" JOIN "Payroll" p ON p.id=i."payrollId" WHERE o."entryId" IN (${sstParameters(entries.map(entry => entry.id))})`) : [];
  return { beneficiary, entries, summary, beneficiaries, origins, total, page, from, to };
}

export async function readBenefitReconciliation(context: AppContext, beneficiaryId: string, competence: string) {
  benefitCompetence.parse(competence);
  const database = sstDatabase(context), beneficiary = await findSstBenefitBeneficiary(database, beneficiaryId);
  if (!beneficiary) throw new Error("Beneficiário não encontrado.");
  assertBudgetUnitAccess(context.user, beneficiary.plan.budgetUnitId);
  const employeeId = beneficiary.payrollBenefit.employeeId;
  const rows = await database.select({ entry: sstBenefitEntries }).from(sstBenefitEntries).innerJoin(sstBeneficiaries, eq(sstBeneficiaries.id, sstBenefitEntries.beneficiaryId)).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).where(and(eq(sstBenefitEntries.competence, competence), eq(sstBeneficiaries.planId, beneficiary.planId), eq(sstPayrollBenefits.employeeId, employeeId))).then(records => records.map(row => row.entry));
  const results = [];
  const origins = rows.length ? await sstRows<{ entryId: string; payrollItemId: string; amount: string; status: string; eventId: string }>(database, sql`SELECT o."entryId",o."payrollItemId",(CASE WHEN ev.type='Desconto' THEN i."valueDecimal" ELSE -i."valueDecimal" END)::text AS amount,p.status,i."eventId" FROM "SstBenefitPayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" JOIN "Payroll" p ON p.id=i."payrollId" JOIN "PayrollEvent" ev ON ev.id=i."eventId" WHERE o."entryId" IN (${sstParameters(rows.map(row => row.id))})`) : [];
  for (const category of ["MONTHLY", "EXTRAORDINARY"] as const) {
    const candidates = rows.filter(row => row.candidateSnapshot !== null && typeof row.candidateSnapshot === "object" && !Array.isArray(row.candidateSnapshot) && row.candidateSnapshot.category === category);
    const expected = candidates.reduce((sum, row) => sum.plus(row.amount.toString()), new ExactDecimal(0)).toFixed(2);
    const items = origins.filter(origin => candidates.some(entry => entry.id === origin.entryId));
    const observed = items.reduce((sum, row) => sum.plus(row.amount), new ExactDecimal(0)), difference = new ExactDecimal(expected).minus(observed);
    const issues = [...(items.length !== candidates.length ? ["UNPOSTED_LEDGER_ENTRIES"] : []), ...(!difference.isZero() ? ["AMOUNT_MISMATCH"] : []), "PAYMENT_DATE_UNAVAILABLE"];
    results.push({ category, eventId: [...new Set(items.map(row => row.eventId))].join(" · ") || null, expected, observed: observed.toFixed(2), difference: difference.toFixed(2), itemIds: items.map(row => row.payrollItemId), issues, status: items.length === candidates.length && difference.isZero() ? "RECONCILED_POSTING" : "PENDING_POSTING", candidateIds: candidates.map(row => row.id) });
  }
  return results;
}
