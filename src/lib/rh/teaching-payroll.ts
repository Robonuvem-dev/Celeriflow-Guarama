import { Decimal } from "@/db/decimal";
import type { FunctionalRecord } from "./functional-record-service";
import type { PayrollRubricInput } from "./calculation-engine";
import { matchingFunctionalRules } from "./functional-payroll";

/** Explicit consumption keeps monetary movements distinct from quantities of teaching hours. */
export function resolveTeachingPay(input: { records: FunctionalRecord[]; contract: { regimeId: string; roleId: string; salaryLevel: string | null; monthlyHours: number }; date: Date; rubrics: PayrollRubricInput[]; movements: Record<string, Decimal> }) {
  const rules = matchingFunctionalRules(input.records, "HORA_AULA", input.contract, { start: input.date, end: input.date }).filter(rule => (!rule.data.level || rule.data.level === "*" || rule.data.level === input.contract.salaryLevel) && rule.data.payMode && rule.data.payMode !== "CONSULTA");
  const movements = { ...input.movements }, codes = new Set<string>();
  const memory: Array<{ id: string; version: number; code: string; rate: string; hours: string; amount: string; legalReference: string }> = [];
  for (const rule of rules) {
    const code = rule.data.rubricCode, rubric = input.rubrics.find(rubric => rubric.code === code);
    if (!rubric || rubric.type !== "PROVENTO" || rubric.calculationMethod !== "MANUAL" || codes.has(code)) throw new Error("Hora-aula exige rubrica remuneratória manual única por dia e enquadramento.");
    if (movements[code]?.isZero() === false) throw new Error("Remuneração de horas-aula já possui movimento monetário; concilie a origem antes do cálculo automático.");
    let hours = new Decimal(input.contract.monthlyHours);
    if (rule.data.payMode === "QUANTIDADE_INFORMADA") {
      const source = input.rubrics.find(rubric => rubric.code === rule.data.quantityCode);
      if (!source || source.type !== "BASE" || source.calculationMethod !== "MANUAL" || source.incidences.some(incidence => incidence.isIncluded)) throw new Error("Quantidade de horas-aula exige rubrica BASE manual sem incidências monetárias.");
      hours = movements[source.code] ?? new Decimal(0);
    } else if (rule.data.payMode !== "JORNADA_CONTRATUAL") throw new Error("Forma de consumo de horas-aula inválida.");
    if (!hours.isFinite() || hours.isNegative()) throw new Error("Quantidade de horas-aula inválida.");
    const amount = hours.mul(rule.data.amount);
    movements[code] = amount; codes.add(code);
    memory.push({ id: rule.id, version: rule.version, code, rate: rule.data.amount, hours: hours.toString(), amount: amount.toFixed(8), legalReference: rule.data.legalReference });
  }
  return { movements, memory };
}
