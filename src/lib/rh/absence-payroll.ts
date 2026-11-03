import { Decimal } from "@/db/decimal";
import type { EmploymentContract } from "@/lib/contracts/personnel";
import type { FunctionalRecord } from "./functional-record-service";
import { allocatePayrollAmount, calculateContractRubrics, type PayrollRubricInput } from "./calculation-engine";
import type { resolveMonthlyContractSegments } from "./monthly-proration";
import { applyRemunerationLimits, matchingFunctionalRules } from "./functional-payroll";
import { resolveTeachingPay } from "./teaching-payroll";

/** Configured codes are reduced once per day; overlapping absences never multiply a deduction. */
export function calculateFunctionalMonthlyRubrics<T extends EmploymentContract>(input: {
  contract: T; revisionId: string; segments?: ReturnType<typeof resolveMonthlyContractSegments<T>> | null;
  records: FunctionalRecord[]; period: { start: Date; end: Date }; rubrics: PayrollRubricInput[]; movements: Record<string, Decimal>;
  dailyMovements?: Record<string, Record<string, Decimal>>;
}) {
  const day = 86400000, monthDays = input.period.end.getUTCDate();
  const base = input.segments ?? [{ contract: input.contract, revisionId: input.revisionId,
    start: new Date(Math.max(input.period.start.getTime(), input.contract.admittedAt.getTime())),
    end: new Date(Math.min(Date.UTC(input.period.end.getUTCFullYear(), input.period.end.getUTCMonth(), monthDays), input.contract.endsAt?.getTime() ?? Infinity)), calendarDays: 0 }];
  const days = base.flatMap(segment => {
    const values: Array<{ date: Date; contract: T; revisionId: string }> = [];
    for (let at = segment.start.getTime(); at <= segment.end.getTime(); at += day) values.push({ date: new Date(at), contract: segment.contract, revisionId: segment.revisionId });
    return values;
  });
  if (!days.length) throw new Error("Sem exercício na competência para aplicar efeitos funcionais.");
  const amounts = new Map<string, Decimal>(input.rubrics.map(row => [row.code, new Decimal(0)]));
  const memory: Array<{ date: string; salary: string; roleId: string; revisionId: string; records: string[]; factors: Record<string, string>; teachingPay: ReturnType<typeof resolveTeachingPay>["memory"]; remunerationLimits: ReturnType<typeof applyRemunerationLimits>["memory"] }> = [];
  const dailyResults: Array<ReturnType<typeof calculateContractRubrics>> = [];
  let template: ReturnType<typeof calculateContractRubrics> | undefined;
  for (const segment of days) {
    const records = input.records.filter(row => row.startsAt <= segment.date && (!row.endsAt || row.endsAt >= segment.date));
    const commissions = records.filter(row => row.kind === "COMISSAO");
    if (commissions.length > 1) throw new Error("Comissões simultâneas no mesmo vínculo.");
    const commission = commissions[0], salary = commission?.data.payOption === "SUBSTITUIR" ? new Decimal(commission.data.salary) : segment.contract.salary;
    const factors: Record<string, Decimal> = {};
    for (const record of records.filter(row => ["AFASTAMENTO", "CESSAO"].includes(row.kind))) {
      const codes = record.data.affectedCodes?.split(",").map(code => code.trim()).filter(Boolean) ?? [];
      if (!codes.length) throw new Error("Defina as rubricas afetadas pelo afastamento ou cessão.");
      for (const code of codes) {
        if (!input.rubrics.some(rubric => rubric.code === code && rubric.type === "PROVENTO")) throw new Error(`Rubrica remuneratória não encontrada: ${code}.`);
        const factor = new Decimal(record.data.payPercentage).div(100);
        factors[code] = factors[code] ? Decimal.min(factors[code], factor) : factor;
      }
    }
    let movements = Object.fromEntries(Object.entries(input.movements).map(([code, amount]) => [code, amount.mul(monthDays).div(days.length)]));
    Object.assign(movements, input.dailyMovements?.[segment.date.toISOString().slice(0, 10)] ?? {});
    const teaching = resolveTeachingPay({ records, contract: { ...segment.contract, roleId: commission?.data.roleId ?? segment.contract.roleId }, date: segment.date, rubrics: input.rubrics, movements });
    movements = teaching.movements;
    const original = calculateContractRubrics({ salary, monthlyHours: segment.contract.monthlyHours, days: 30, movements, rubrics: input.rubrics });
    const rubrics = input.rubrics.map(rubric => {
      const factor = factors[rubric.code];
      if (!factor || factor.eq(1)) return rubric;
      // Freeze each affected origin before applying its percentage. A dependent
      // rubric explicitly included in the same policy must not suffer the factor twice.
      movements[rubric.code] = new Decimal(original.items.find(item => item.code === rubric.code)!.value).mul(factor);
      return { ...rubric, calculationMethod: "MANUAL" };
    });
    const dailyPeriod = { start: segment.date, end: segment.date };
    const limits = matchingFunctionalRules(records, "REGRA_LIMITE", { ...segment.contract, roleId: commission?.data.roleId ?? segment.contract.roleId }, dailyPeriod);
    const limited = applyRemunerationLimits({ salary, monthlyHours: segment.contract.monthlyHours, days: 30, movements, rubrics }, limits, dailyPeriod);
    const result = limited.result;
    if (result.items.some(item => new Decimal(item.value).lt(0))) throw new Error("Rubricas negativas exigem origem compensatória antes do rateio funcional.");
    dailyResults.push(result);
    template ??= result;
    for (const item of result.items) amounts.set(item.code, amounts.get(item.code)!.add(new Decimal(item.value).div(monthDays)));
    memory.push({ date: segment.date.toISOString().slice(0, 10), salary: salary.toFixed(2), roleId: commission?.data.roleId ?? segment.contract.roleId, revisionId: segment.revisionId, records: records.map(row => `${row.id}/${row.version}`), factors: Object.fromEntries(Object.entries(factors).map(([code, value]) => [code, value.toString()])), teachingPay: teaching.memory, remunerationLimits: limited.memory });
  }
  const items = template!.items.map(item => ({ ...item, value: amounts.get(item.code)!.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2), method: "VIGENCIA_FUNCIONAL_DIARIA", movement: (input.movements[item.code] ?? new Decimal(0)).toFixed(2) }));
  const dailyItems = dailyResults.map(result => result.items.map(item => ({ ...item })));
  for (const item of items) {
    const shares = allocatePayrollAmount(new Decimal(item.value), dailyResults.map(result => new Decimal(result.items.find(value => value.code === item.code)!.value)));
    dailyItems.forEach((entries, index) => { entries.find(entry => entry.code === item.code)!.value = shares[index].toFixed(2); });
  }
  const bases: Record<string, Decimal> = {};
  let gross = new Decimal(0), deductions = new Decimal(0);
  for (const item of items) {
    if (item.type === "PROVENTO") gross = gross.add(item.value);
    if (item.type === "DESCONTO") deductions = deductions.add(item.value);
    for (const incidence of input.rubrics.find(row => row.code === item.code)!.incidences.filter(row => row.isIncluded)) bases[incidence.incidenceType] = (bases[incidence.incidenceType] ?? new Decimal(0)).add(new Decimal(item.value).mul(item.type === "DESCONTO" ? -1 : 1));
  }
  return { result: { items, bases, gross, deductions, net: gross.sub(deductions), employer: new Decimal(0) }, referenceResults: dailyResults, memory: { monthDays, calendarDays: days.length, dailyFunctionalEffects: memory, segments: days.map((segment, index) => ({ revisionId: segment.revisionId, start: segment.date.toISOString().slice(0, 10), end: segment.date.toISOString().slice(0, 10), calendarDays: 1, factor: new Decimal(1).div(monthDays).toString(), salary: memory[index].salary, monthlyHours: segment.contract.monthlyHours, workLocation: segment.contract.workLocation, costCenterId: segment.contract.costCenterId, departmentId: segment.contract.departmentId, items: dailyItems[index] })) } };
}
