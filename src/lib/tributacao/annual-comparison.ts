import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { taxAssessmentAccessFilter, taxScopeSnapshot } from "./scope";

export const annualComparisonFilters = z.object({
  governmentEntityId: z.string().min(1), budgetUnitId: z.string().optional(), taxId: z.string().optional(),
  firstYear: z.coerce.number().int().min(1900).max(9999), secondYear: z.coerce.number().int().min(1900).max(9999),
  query: z.string().max(240).default(""), direction: z.enum(["ALL", "INCREASE", "DECREASE"]).default("ALL"),
  metric: z.enum(["NET", "VENAL"]).default("NET"),
  minimumPercentage: z.string().default("0").refine(value => { try { const number = new Prisma.Decimal(value); return number.isFinite() && number.gte(0); } catch { return false; } }, "Percentual mínimo inválido."),
  minimumDifference: z.string().default("0").refine(value => { try { const number = new Prisma.Decimal(value); return number.isFinite() && number.gte(0); } catch { return false; } }, "Diferença mínima inválida."),
}).refine(value => value.firstYear !== value.secondYear, "Selecione dois exercícios distintos.");

export function annualValueChange(first: Prisma.Decimal, second: Prisma.Decimal) {
  const difference = second.minus(first);
  return { difference: difference.toFixed(2), percentage: first.isZero() ? null : difference.div(first).mul(100).toDecimalPlaces(6).toString() };
}

export async function readAnnualTaxComparison(db: PrismaClient, actor: { allowedBudgetUnitIds?: string[] }, input: z.input<typeof annualComparisonFilters>) {
  const filters = annualComparisonFilters.parse(input);
  return db.$transaction(async tx => {
    const bindings = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: filters.governmentEntityId, ...(actor.allowedBudgetUnitIds ? { budgetUnitId: { in: actor.allowedBudgetUnitIds } } : {}) }, select: { budgetUnitId: true } });
    const units = bindings.map(binding => binding.budgetUnitId);
    if (!units.length || filters.budgetUnitId && !units.includes(filters.budgetUnitId)) throw new Error("Ente/UG fora do acesso autorizado.");
    const selectedUnits = filters.budgetUnitId ? [filters.budgetUnitId] : units;
    const rows = await tx.taxAssessment.findMany({ where: { year: { in: [filters.firstYear, filters.secondYear] }, status: { not: "Cancelado" }, ...(filters.taxId ? { taxId: filters.taxId } : {}), AND: [taxAssessmentAccessFilter(selectedUnits), { calculationSnapshot: { path: ["governmentEntityId"], equals: filters.governmentEntityId } }] }, include: { tax: true, taxpayer: { include: { person: true, company: true } }, realEstate: true, economicRegistration: true, guides: { include: { payments: { where: { status: "Confirmado" } } } } } });
    type Position = { launched: Prisma.Decimal; net: Prisma.Decimal; discount: Prisma.Decimal; paid: Prisma.Decimal; outstanding: Prisma.Decimal; assessments: number; guides: number; pendingDecimal: number };
    const position = (): Position => ({ launched: new Prisma.Decimal(0), net: new Prisma.Decimal(0), discount: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), outstanding: new Prisma.Decimal(0), assessments: 0, guides: 0, pendingDecimal: 0 });
    const propertyIds = [...new Set(rows.map(row => row.realEstateId).filter((id): id is string => Boolean(id)))];
    const valuations = await tx.propertyValuation.findMany({ where: { realEstateId: { in: propertyIds }, year: { in: [filters.firstYear, filters.secondYear] } } });
    const valuationMap = new Map(valuations.map(valuation => [`${valuation.realEstateId}:${valuation.year}`, valuation.venalValueDecimal]));
    const movements = await tx.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", entityId: { in: rows.map(row => row.id) }, category: "CREDIT_MOVEMENT", status: "EFETIVADO" }, select: { entityId: true, data: true } });
    const compensatedByAssessment = new Map<string, Prisma.Decimal>();
    for (const movement of movements) {
      const data = taxScopeSnapshot(movement.data);
      if (data.operation === "COMPENSAR") compensatedByAssessment.set(movement.entityId, (compensatedByAssessment.get(movement.entityId) ?? new Prisma.Decimal(0)).plus(String(data.amount)));
    }
    const groups = new Map<string, { key: string; propertyId: string | null; tax: string; taxpayers: Set<string>; registration: string; first: Position; second: Position }>();
    for (const row of rows) {
      const scope = taxScopeSnapshot(row.calculationSnapshot);
      const key = `${String(scope.budgetUnitId)}:${row.taxId}:${row.realEstateId ? `PROPERTY:${row.realEstateId}` : row.economicRegistrationId ? `ECONOMIC:${row.economicRegistrationId}` : `TAXPAYER:${row.taxpayerId}`}`;
      let group = groups.get(key);
      if (!group) { group = { key, propertyId: row.realEstateId, tax: row.tax.name, taxpayers: new Set(), registration: row.realEstate?.municipalInsc ?? row.economicRegistration?.municipalInsc ?? "Sem inscrição vinculada", first: position(), second: position() }; groups.set(key, group); }
      group.taxpayers.add(row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayer.id);
      const target = row.year === filters.firstYear ? group.first : group.second;
      target.assessments++;
      target.guides += row.guides.filter(guide => guide.status !== "Cancelada").length;
      const payments = row.guides.flatMap(guide => guide.payments);
      if (!row.originalValueDecimal || !row.finalValueDecimal || !row.discountValueDecimal || payments.some(payment => !payment.amountPaidDecimal)) { target.pendingDecimal++; continue; }
      const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
      target.launched = target.launched.plus(row.originalValueDecimal);
      target.net = target.net.plus(row.finalValueDecimal);
      target.discount = target.discount.plus(row.discountValueDecimal);
      target.paid = target.paid.plus(paid);
      const compensated = compensatedByAssessment.get(row.id) ?? new Prisma.Decimal(0);
      target.outstanding = target.outstanding.plus(Prisma.Decimal.max(0, row.finalValueDecimal.minus(paid).minus(compensated)));
    }
    const serialize = (value: Position) => ({ launched: value.launched.toFixed(2), net: value.net.toFixed(2), discount: value.discount.toFixed(2), paid: value.paid.toFixed(2), outstanding: value.outstanding.toFixed(2), assessments: value.assessments, guides: value.guides, pendingDecimal: value.pendingDecimal });
    const query = filters.query.toLocaleLowerCase("pt-BR");
    const comparison = (group: typeof groups extends Map<string, infer G> ? G : never) => {
      const first = filters.metric === "VENAL" ? group.propertyId ? valuationMap.get(`${group.propertyId}:${filters.firstYear}`) : null : group.first.pendingDecimal ? null : group.first.net;
      const second = filters.metric === "VENAL" ? group.propertyId ? valuationMap.get(`${group.propertyId}:${filters.secondYear}`) : null : group.second.pendingDecimal ? null : group.second.net;
      return { first: first?.toFixed(2) ?? null, second: second?.toFixed(2) ?? null, change: first && second ? annualValueChange(first, second) : null };
    };
    const selected = [...groups.values()].filter(group => `${group.tax} ${[...group.taxpayers].join(" / ")} ${group.registration}`.toLocaleLowerCase("pt-BR").includes(query)).filter(group => { const change = comparison(group).change; if (!change) return true; const difference = new Prisma.Decimal(change.difference); return difference.abs().gte(filters.minimumDifference) && (new Prisma.Decimal(filters.minimumPercentage).isZero() || change.percentage !== null && new Prisma.Decimal(change.percentage).abs().gte(filters.minimumPercentage)) && (filters.direction === "ALL" || filters.direction === "INCREASE" && difference.gt(0) || filters.direction === "DECREASE" && difference.lt(0)); });
    const totals = [position(), position()];
    for (const group of selected) for (const [index, value] of [group.first, group.second].entries()) { const total = totals[index]; for (const key of ["launched", "net", "discount", "paid", "outstanding"] as const) total[key] = total[key].plus(value[key]); total.assessments += value.assessments; total.guides += value.guides; total.pendingDecimal += value.pendingDecimal; }
    return { filters, generatedAt: new Date().toISOString(), first: serialize(totals[0]), second: serialize(totals[1]), rows: selected.map(group => { const compared = comparison(group); return { key: group.key, tax: group.tax, taxpayer: [...group.taxpayers].sort().join(" / "), registration: group.registration, first: serialize(group.first), second: serialize(group.second), comparedFirst: compared.first, comparedSecond: compared.second, change: compared.change }; }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}
