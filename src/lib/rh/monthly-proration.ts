import { Decimal } from "@/db/decimal";
import type { EmploymentContract, EmploymentRevision } from "@/lib/contracts/personnel";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { allocatePayrollAmount, calculateContractRubrics, type PayrollRubricInput } from "./calculation-engine";

export const monthlyProrationPolicySchema = z.object({ origin: z.literal("RATEIO_MENSAL_CIVIL"), divisor: z.literal("DIAS_CIVIS_MES"), manualMovements: z.literal("VALOR_INTEGRAL_RATEADO"), legalReference: z.string().min(3), estimated: z.literal(true) }).strict();
const day = 86400000;

export function resolveMonthlyContractSegments<T extends EmploymentContract>(record: T, revisions: EmploymentRevision[], period: { start: Date; end: Date }, allowEmpty = false) {
  const endExclusive = new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth(), period.end.getUTCDate() + 1));
  const boundaries = [...new Set([period.start.getTime(), endExclusive.getTime(), ...revisions.filter(revision => revision.effectiveFrom > period.start && revision.effectiveFrom < endExclusive).map(revision => revision.effectiveFrom.getTime())])].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const point = new Date(boundaries[index]);
    if (!revisions.some(revision => revision.effectiveFrom <= point)) continue;
    const resolved = resolveContractRevision(record, revisions, { start: point, end: point });
    const contract = resolved.contract;
    const start = new Date(Math.max(point.getTime(), contract.admittedAt.getTime()));
    const end = new Date(Math.min(boundaries[index + 1] - day, contract.endsAt?.getTime() ?? Infinity));
    if (contract.status !== "ATIVO" || end < start) continue;
    if ([start, end].some(date => date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds() || date.getUTCMilliseconds())) throw new Error("Rateio mensal exige vigências em datas civis UTC.");
    segments.push({ contract, revisionId: resolved.revisionId, start, end, calendarDays: Math.round((end.getTime() - start.getTime()) / day) + 1 });
  }
  if (!segments.length && !allowEmpty) throw new Error("Contrato sem exercício ativo na competência.");
  if (new Set(segments.map(segment => segment.contract.regimeId)).size > 1) throw new Error("Rateio com mudança de regime/previdência exige política de transição específica.");
  return segments;
}

export function calculateProratedMonthlyRubrics<T extends EmploymentContract>(input: { segments: ReturnType<typeof resolveMonthlyContractSegments<T>>; period: { start: Date; end: Date }; rubrics: PayrollRubricInput[]; movements: Record<string, Decimal>; policy: unknown }) {
  const policy = monthlyProrationPolicySchema.parse(input.policy);
  const monthDays = input.period.end.getUTCDate();
  const shares = Object.fromEntries(Object.entries(input.movements).map(([code, amount]) => {
    if (amount.lt(0)) throw new Error("Rateio de movimentos negativos exige origem compensatória própria.");
    return [code, allocatePayrollAmount(amount, input.segments.map(segment => new Decimal(segment.calendarDays)))];
  }));
  const parts = input.segments.map((segment, index) => {
    const factor = new Decimal(segment.calendarDays).div(monthDays);
    const movements = Object.fromEntries(Object.entries(shares).map(([code, allocations]) => [code, allocations[index].div(factor)]));
    const full = calculateContractRubrics({ salary: segment.contract.salary, monthlyHours: segment.contract.monthlyHours, days: 30, movements, rubrics: input.rubrics });
    const rawValues = Object.fromEntries(full.items.map(item => [item.code, new Decimal(item.value).mul(factor)]));
    if (Object.values(rawValues).some(value => value.lt(0))) throw new Error("Rateio de rubricas negativas exige compensação própria.");
    const items = full.items.map(item => ({ ...item, value: rawValues[item.code].toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2), movement: (shares[item.code]?.[index] ?? new Decimal(0)).toFixed(2) }));
    return { rawValues, revisionId: segment.revisionId, start: segment.start.toISOString().slice(0, 10), end: segment.end.toISOString().slice(0, 10), calendarDays: segment.calendarDays, factor: factor.toString(), salary: segment.contract.salary.toFixed(2), monthlyHours: segment.contract.monthlyHours, workLocation: segment.contract.workLocation, costCenterId: segment.contract.costCenterId, departmentId: segment.contract.departmentId, items };
  });
  for (const rubric of input.rubrics) {
    const weights = parts.map(part => part.rawValues[rubric.code]);
    const total = weights.reduce((sum, value) => sum.add(value), new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const allocations = allocatePayrollAmount(total, weights);
    parts.forEach((part, index) => { part.items.find(item => item.code === rubric.code)!.value = allocations[index].toFixed(2); });
  }
  const items = input.rubrics.map(rubric => {
    const values = parts.map(part => part.items.find(item => item.code === rubric.code)!);
    return { ...values[0], method: "RATEIO_MENSAL_CIVIL", value: values.reduce((sum, item) => sum.add(item.value), new Decimal(0)).toFixed(2), movement: (input.movements[rubric.code] ?? new Decimal(0)).toFixed(2) };
  });
  const bases: Record<string, Decimal> = {};
  let gross = new Decimal(0), deductions = new Decimal(0);
  for (const item of items) {
    const rubric = input.rubrics.find(rubric => rubric.code === item.code)!;
    if (item.type === "PROVENTO") gross = gross.add(item.value);
    if (item.type === "DESCONTO") deductions = deductions.add(item.value);
    for (const incidence of rubric.incidences.filter(incidence => incidence.isIncluded)) bases[incidence.incidenceType] = (bases[incidence.incidenceType] ?? new Decimal(0)).add(item.type === "DESCONTO" ? new Decimal(item.value).negated() : item.value);
  }
  return { result: { items, bases, gross, deductions, net: gross.sub(deductions), employer: new Decimal(0) }, memory: { policy, monthDays, calendarDays: input.segments.reduce((sum, segment) => sum + segment.calendarDays, 0), segments: parts.map(({ rawValues, ...part }) => ({ ...part, unroundedAmounts: Object.fromEntries(Object.entries(rawValues).map(([code, value]) => [code, value.toString()])) })) } };
}
