import { Decimal } from "@/db/decimal";
import type { calculateContractRubrics, PayrollRubricInput } from "./calculation-engine";

export const terminationTaxGroups = ["MENSAL", "DECIMO_TERCEIRO"] as const;
export type TerminationTaxGroup = typeof terminationTaxGroups[number];
const thirteenth = new Set(["POC_DECIMO_13", "POC_ABATIMENTO", "POC_ADIANTAMENTO_13"]);
export function terminationTaxGroup(code: string): TerminationTaxGroup { return thirteenth.has(code) ? "DECIMO_TERCEIRO" : "MENSAL"; }

/** Group existing incidence declarations; an indemnity is not made taxable by its name. */
export function terminationIncidenceBases(result: ReturnType<typeof calculateContractRubrics>, rubrics: PayrollRubricInput[], incidence: string, exclusions: Array<{ rubricCode: string; employeeExclusion: string; employerExclusion: string }> = []) {
  const bases = { MENSAL: new Decimal(0), DECIMO_TERCEIRO: new Decimal(0) };
  for (const item of result.items) {
    if (item.code === "IRRF" || item.code.startsWith("PREVIDENCIA_") || item.code.startsWith("PENSAO_")) continue;
    const rubric = rubrics.find(row => row.code === item.code);
    if (item.code === "POC_ABATIMENTO") {
      if (rubric?.incidences.some(row => row.incidenceType === incidence && row.isIncluded)) throw new Error("O abatimento de parcelas já concedidas não reduz a base integral rescisória de 13º; concilie os tributos anteriores pela memória de recolhimentos.");
      continue;
    }
    if (rubric?.incidences.some(row => row.incidenceType === incidence && row.isIncluded)) {
      bases[terminationTaxGroup(item.code)] = bases[terminationTaxGroup(item.code)].add(new Decimal(item.value).mul(item.type === "DESCONTO" ? -1 : 1));
    }
  }
  const employee = { ...bases }, employer = { ...bases };
  for (const option of exclusions) {
    const group = terminationTaxGroup(option.rubricCode);
    employee[group] = employee[group].sub(option.employeeExclusion);
    employer[group] = employer[group].sub(option.employerExclusion);
  }
  for (const group of terminationTaxGroups) if (employee[group].lt(0) || employer[group].lt(0)) throw new Error(`Base rescisória ${incidence}/${group} negativa; concilie incidências e abatimentos.`);
  return { original: bases, employee, employer };
}
