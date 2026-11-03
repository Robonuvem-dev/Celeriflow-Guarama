import { Decimal } from "@/db/decimal";
import type { EmploymentContract } from "@/lib/contracts/personnel";
import type { FunctionalRecord } from "./functional-record-service";
import { calculateFunctionalMonthlyRubrics } from "./absence-payroll";
import type { resolveMonthlyContractSegments } from "./monthly-proration";
import type { PayrollRubricInput } from "./calculation-engine";

/** Benefit values are temporal amounts, independent of the former active salary. */
export function calculateBeneficiaryMonthlyRubrics<T extends EmploymentContract>(input: { contract: T; revisionId: string; segments?: ReturnType<typeof resolveMonthlyContractSegments<T>> | null; records: FunctionalRecord[]; period: { start: Date; end: Date }; rubrics: PayrollRubricInput[]; movements: Record<string, Decimal>; dailyMovements?: Record<string, Record<string, Decimal>> }) {
  const source = input.segments ?? [{ contract: input.contract, revisionId: input.revisionId, start: new Date(Math.max(input.period.start.getTime(), input.contract.admittedAt.getTime())), end: new Date(Math.min(Date.UTC(input.period.end.getUTCFullYear(), input.period.end.getUTCMonth(), input.period.end.getUTCDate()), input.contract.endsAt?.getTime() ?? Infinity)), calendarDays: 0 }];
  const segments = source.flatMap(segment => {
    const days = [];
    for (let at = segment.start.getTime(); at <= segment.end.getTime(); at += 86400000) {
      const date = new Date(at), category = input.records.filter(row => row.kind === "CATEGORIA_FOLHA" && row.startsAt <= date && (!row.endsAt || row.endsAt >= date));
      if (category.length !== 1 || !["APOSENTADO", "PENSIONISTA"].includes(category[0].data.category)) throw new Error("Benefício sem valor e enquadramento único no dia de cálculo.");
      days.push({ ...segment, start: date, end: date, calendarDays: 1, contract: { ...segment.contract, salary: new Decimal(category[0].data.amount) } });
    }
    return days;
  });
  const limits = input.records.filter(row => row.kind === "REGRA_LIMITE_BENEFICIO").map(row => ({ ...row, kind: "REGRA_LIMITE" as const }));
  return calculateFunctionalMonthlyRubrics({ ...input, segments, records: limits });
}
