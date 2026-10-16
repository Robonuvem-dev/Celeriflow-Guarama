import { Prisma } from "@prisma/client";
import { assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { sstUnitWhere } from "./access";
import { benefitCompetence, competenceInterval, ExactDecimal, summarizeBenefitLedger } from "./benefit-policy";

export async function listBenefitBeneficiaries(context: AppContext, params: { q?: string; page?: string }, portal = false) {
  if (portal && !context.user.employeeId) return { total: 0, page: 1, rows: [] };
  const units = portal ? [] : await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), select: { id: true } });
  const q = (params.q ?? "").trim().slice(0, 120);
  const where: Prisma.SstBenefitBeneficiaryWhereInput = {
    ...(portal ? { payrollBenefit: { employeeId: context.user.employeeId! } } : { plan: { budgetUnitId: { in: units.map((unit) => unit.id) } } }),
    ...(q ? { OR: [{ payrollBenefit: { employee: { name: { contains: q, mode: "insensitive" } } } }, { plan: { benefitConfig: { name: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const total = await context.prisma.sstBenefitBeneficiary.count({ where });
  const requested = Number(params.page);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.sstBenefitBeneficiary.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { plan: { include: { benefitConfig: { select: { name: true } } } }, payrollBenefit: { include: { employee: { select: { name: true, registration: true } } } }, dependent: { select: { name: true } } } });
  return { total, page, rows };
}

export async function readBenefitStatement(context: AppContext, id: string, params: { from: string; to: string; page?: string }, portal = false) {
  const from = benefitCompetence.parse(params.from);
  const to = benefitCompetence.parse(params.to);
  const first = competenceInterval(from).start;
  const last = competenceInterval(to).start;
  const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth();
  if (months < 0 || months > 119) throw new Error("Selecione período de até 120 competências em ordem cronológica.");
  const beneficiary = await context.prisma.sstBenefitBeneficiary.findFirst({ where: { id, ...(portal ? { payrollBenefit: { employeeId: context.user.employeeId ?? "NO_EMPLOYEE" } } : { plan: { budgetUnit: sstUnitWhere(context) } }) }, include: { plan: { include: { benefitConfig: true } }, payrollBenefit: { include: { employee: true } }, dependent: true } });
  if (!beneficiary) return null;
  if (!portal) assertBudgetUnitAccess(context.user, beneficiary.plan.budgetUnitId);
  const competences = Array.from({ length: months + 1 }, (_, index) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
    return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  });
  // The statement shows the entire canonical employee assignment, with separate
  // beneficiary periods; this makes titular/dependent amounts reconcilable.
  const where: Prisma.SstBenefitEntryWhereInput = { beneficiary: { planId: beneficiary.planId, payrollBenefit: { employeeId: beneficiary.payrollBenefit.employeeId } }, competence: { in: competences } };
  const totals = await context.prisma.sstBenefitEntry.groupBy({ by: ["beneficiaryId", "competence", "kind"], where, _sum: { amount: true } });
  const summary = summarizeBenefitLedger(totals.map((row) => ({ ...row, amount: row._sum.amount ?? new ExactDecimal(0) }))).sort((left, right) => competenceInterval(left.competence).start.getTime() - competenceInterval(right.competence).start.getTime() || left.beneficiaryId.localeCompare(right.beneficiaryId));
  const total = await context.prisma.sstBenefitEntry.count({ where });
  const requested = Number(params.page);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const entries = await context.prisma.sstBenefitEntry.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { beneficiary: { include: { dependent: { select: { name: true } } } } } });
  const beneficiaries = await context.prisma.sstBenefitBeneficiary.findMany({ where: { id: { in: [...new Set(summary.map((row) => row.beneficiaryId))] } }, select: { id: true, snapshot: true, dependentId: true, cardNumber: true } });
  const origins = entries.length ? await context.prisma.$queryRaw<{ entryId: string; payrollItemId: string; payrollId: string; status: string }[]>(Prisma.sql`SELECT o."entryId",o."payrollItemId",i."payrollId",p.status FROM "SstBenefitPayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" JOIN "Payroll" p ON p.id=i."payrollId" WHERE o."entryId" IN (${Prisma.join(entries.map((entry) => entry.id))})`) : [];
  return { beneficiary, entries, summary, beneficiaries, origins, total, page, from, to };
}

export async function readBenefitReconciliation(context: AppContext, beneficiaryId: string, competence: string) {
  benefitCompetence.parse(competence);
  const beneficiary = await context.prisma.sstBenefitBeneficiary.findFirstOrThrow({ where: { id: beneficiaryId, plan: { budgetUnit: sstUnitWhere(context) } }, include: { payrollBenefit: true, plan: true } });
  assertBudgetUnitAccess(context.user, beneficiary.plan.budgetUnitId);
  const employeeId = beneficiary.payrollBenefit.employeeId;
  const rows = await context.prisma.sstBenefitEntry.findMany({ where: { competence, beneficiary: { planId: beneficiary.planId, payrollBenefit: { employeeId } } } });
  const results = [];
  const origins = rows.length ? await context.prisma.$queryRaw<{ entryId: string; payrollItemId: string; amount: Prisma.Decimal; status: string; eventId: string }[]>(Prisma.sql`SELECT o."entryId",o."payrollItemId",CASE WHEN ev.type='Desconto' THEN i."valueDecimal" ELSE -i."valueDecimal" END AS amount,p.status,i."eventId" FROM "SstBenefitPayrollOrigin" o JOIN "PayrollItem" i ON i.id=o."payrollItemId" JOIN "Payroll" p ON p.id=i."payrollId" JOIN "PayrollEvent" ev ON ev.id=i."eventId" WHERE o."entryId" IN (${Prisma.join(rows.map((row) => row.id))})`) : [];
  for (const category of ["MONTHLY", "EXTRAORDINARY"] as const) {
    const candidates = rows.filter((row) => (row.candidateSnapshot as Prisma.JsonObject).category === category);
    const expected = candidates.reduce((sum, row) => sum.plus(row.amount), new ExactDecimal(0)).toFixed(2);
    const items = origins.filter((origin) => candidates.some((entry) => entry.id === origin.entryId));
    const observed = items.reduce((sum, row) => sum.plus(row.amount.toString()), new ExactDecimal(0));
    const difference = new ExactDecimal(expected).minus(observed);
    const issues = [...(items.length !== candidates.length ? ["UNPOSTED_LEDGER_ENTRIES"] : []), ...(!difference.isZero() ? ["AMOUNT_MISMATCH"] : []), "PAYMENT_DATE_UNAVAILABLE"];
    results.push({ category, eventId: [...new Set(items.map((row) => row.eventId))].join(" · ") || null, expected, observed: observed.toFixed(2), difference: difference.toFixed(2), itemIds: items.map((row) => row.payrollItemId), issues, status: items.length === candidates.length && difference.isZero() ? "RECONCILED_POSTING" : "PENDING_POSTING", candidateIds: candidates.map((row) => row.id) });
  }
  return results;
}
