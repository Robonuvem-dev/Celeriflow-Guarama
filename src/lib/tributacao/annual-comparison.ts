import { and, inArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { pageValuations } from "@/db/schema/taxation-pages";
import { readAnnualAssessmentRows, readAnnualCreditMovements, readAnnualUnitBindings } from "@/db/repositories/tax-annual/reports";
import type { AnnualComparisonPosition, AnnualValueChange } from "@/lib/contracts/tax-annual";
import { z } from "zod";
import { taxScopeSnapshot } from "./scope";

export const annualComparisonFilters = z.object({
  governmentEntityId: z.string().min(1), budgetUnitId: z.string().optional(), taxId: z.string().optional(),
  firstYear: z.coerce.number().int().min(1900).max(9999), secondYear: z.coerce.number().int().min(1900).max(9999),
  query: z.string().max(240).default(""), direction: z.enum(["ALL", "INCREASE", "DECREASE"]).default("ALL"),
  metric: z.enum(["NET", "VENAL"]).default("NET"),
  minimumPercentage: z.string().default("0").refine(value => { try { const number = new Decimal(value); return number.isFinite() && number.gte(0); } catch { return false; } }, "Percentual mínimo inválido."),
  minimumDifference: z.string().default("0").refine(value => { try { const number = new Decimal(value); return number.isFinite() && number.gte(0); } catch { return false; } }, "Diferença mínima inválida."),
}).refine(value => value.firstYear !== value.secondYear, "Selecione dois exercícios distintos.");

export function annualValueChange(first: Decimal, second: Decimal): AnnualValueChange {
  const difference = second.minus(first);
  return { difference: difference.toFixed(2), percentage: first.isZero() ? null : difference.div(first).mul(100).toDecimalPlaces(6).toString() };
}

export async function readAnnualTaxComparison(connection: DatabaseConnection, actor: { allowedBudgetUnitIds?: string[] }, input: z.input<typeof annualComparisonFilters>) {
  const filters = annualComparisonFilters.parse(input);
  return withDatabaseTransaction(connection, async tx => {
    const bindings = await readAnnualUnitBindings(tx, filters.governmentEntityId, actor.allowedBudgetUnitIds);
    const units = bindings.map(binding => binding.budgetUnitId);
    if (!units.length || filters.budgetUnitId && !units.includes(filters.budgetUnitId)) throw new Error("Ente/UG fora do acesso autorizado.");
    const selectedUnits = filters.budgetUnitId ? [filters.budgetUnitId] : units;
    const { assessments: rows } = await readAnnualAssessmentRows(tx, { years: [filters.firstYear, filters.secondYear], entityId: filters.governmentEntityId, units: selectedUnits, taxId: filters.taxId, excludeCancelled: true });
    type Position = { launched: Decimal; net: Decimal; discount: Decimal; paid: Decimal; outstanding: Decimal; assessments: number; guides: number; pendingDecimal: number };
    const position = (): Position => ({ launched: new Decimal(0), net: new Decimal(0), discount: new Decimal(0), paid: new Decimal(0), outstanding: new Decimal(0), assessments: 0, guides: 0, pendingDecimal: 0 });
    const propertyIds = [...new Set(rows.map(row => row.realEstateId).filter((id): id is string => Boolean(id)))];
    const valuations = propertyIds.length ? await tx.select().from(pageValuations).where(and(inArray(pageValuations.realEstateId, propertyIds), inArray(pageValuations.year, [filters.firstYear, filters.secondYear]))) : [];
    const valuationMap = new Map(valuations.map(valuation => [`${valuation.realEstateId}:${valuation.year}`, valuation.venalValueDecimal]));
    const movements = await readAnnualCreditMovements(tx, rows.map(row => row.id));
    const compensatedByAssessment = new Map<string, Decimal>();
    for (const movement of movements) {
      const data = taxScopeSnapshot(movement.data);
      if (data.operation === "COMPENSAR") compensatedByAssessment.set(movement.entityId, (compensatedByAssessment.get(movement.entityId) ?? new Decimal(0)).plus(String(data.amount)));
    }
    const groups = new Map<string, { key: string; propertyId: string | null; tax: string; taxpayers: Set<string>; registration: string; first: Position; second: Position }>();
    for (const row of rows) {
      const scope = taxScopeSnapshot(row.calculationSnapshot);
      const key = `${String(scope.budgetUnitId)}:${row.taxId}:${row.realEstateId ? `PROPERTY:${row.realEstateId}` : row.economicRegistrationId ? `ECONOMIC:${row.economicRegistrationId}` : `TAXPAYER:${row.taxpayerId}`}`;
      let group = groups.get(key);
      if (!group) { group = { key, propertyId: row.realEstateId, tax: row.tax.name, taxpayers: new Set(), registration: row.realEstate?.municipalInsc ?? row.economicRegistration?.municipalInsc ?? "Sem inscrição vinculada", first: position(), second: position() }; groups.set(key, group); }
      group.taxpayers.add(row.taxpayer.corporateName ?? row.taxpayer.fullName ?? row.taxpayer.id);
      const target = row.year === filters.firstYear ? group.first : group.second;
      target.assessments++;
      target.guides += row.guides.filter(guide => guide.status !== "Cancelada").length;
      const payments = row.guides.flatMap(guide => guide.payments);
      if (!row.originalValueDecimal || !row.finalValueDecimal || !row.discountValueDecimal || payments.some(payment => !payment.amountPaidDecimal)) { target.pendingDecimal++; continue; }
      const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0));
      target.launched = target.launched.plus(row.originalValueDecimal);
      target.net = target.net.plus(row.finalValueDecimal);
      target.discount = target.discount.plus(row.discountValueDecimal);
      target.paid = target.paid.plus(paid);
      const compensated = compensatedByAssessment.get(row.id) ?? new Decimal(0);
      target.outstanding = target.outstanding.plus(Decimal.max(0, row.finalValueDecimal.minus(paid).minus(compensated)));
    }
    const serialize = (value: Position): AnnualComparisonPosition => ({ launched: value.launched.toFixed(2), net: value.net.toFixed(2), discount: value.discount.toFixed(2), paid: value.paid.toFixed(2), outstanding: value.outstanding.toFixed(2), assessments: value.assessments, guides: value.guides, pendingDecimal: value.pendingDecimal });
    const query = filters.query.toLocaleLowerCase("pt-BR");
    const comparison = (group: typeof groups extends Map<string, infer G> ? G : never) => {
      const first = filters.metric === "VENAL" ? group.propertyId ? valuationMap.get(`${group.propertyId}:${filters.firstYear}`) : null : group.first.pendingDecimal ? null : group.first.net;
      const second = filters.metric === "VENAL" ? group.propertyId ? valuationMap.get(`${group.propertyId}:${filters.secondYear}`) : null : group.second.pendingDecimal ? null : group.second.net;
      return { first: first?.toFixed(2) ?? null, second: second?.toFixed(2) ?? null, change: first && second ? annualValueChange(first, second) : null };
    };
    const selected = [...groups.values()].filter(group => `${group.tax} ${[...group.taxpayers].join(" / ")} ${group.registration}`.toLocaleLowerCase("pt-BR").includes(query)).filter(group => { const change = comparison(group).change; if (!change) return true; const difference = new Decimal(change.difference); return difference.abs().gte(filters.minimumDifference) && (new Decimal(filters.minimumPercentage).isZero() || change.percentage !== null && new Decimal(change.percentage).abs().gte(filters.minimumPercentage)) && (filters.direction === "ALL" || filters.direction === "INCREASE" && difference.gt(0) || filters.direction === "DECREASE" && difference.lt(0)); });
    const totals = [position(), position()];
    for (const group of selected) for (const [index, value] of [group.first, group.second].entries()) { const total = totals[index]; for (const key of ["launched", "net", "discount", "paid", "outstanding"] as const) total[key] = total[key].plus(value[key]); total.assessments += value.assessments; total.guides += value.guides; total.pendingDecimal += value.pendingDecimal; }
    return { filters, generatedAt: new Date().toISOString(), first: serialize(totals[0]), second: serialize(totals[1]), rows: selected.map(group => { const compared = comparison(group); return { key: group.key, tax: group.tax, taxpayer: [...group.taxpayers].sort().join(" / "), registration: group.registration, first: serialize(group.first), second: serialize(group.second), comparedFirst: compared.first, comparedSecond: compared.second, change: compared.change }; }) };
  }, { isolationLevel: "repeatable read", timeoutMs: 60000 });
}
