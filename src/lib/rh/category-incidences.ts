import type { PayrollRubricInput } from "./calculation-engine";
import type { FunctionalRecord } from "./functional-record-service";
import { matchingFunctionalRules } from "./functional-payroll";

/** Category applicability can exclude a declared incidence, never invent one on an unrelated rubric. */
export function resolveCategoryIncidences<T extends PayrollRubricInput>(records: FunctionalRecord[], contract: { regimeId: string; roleId: string }, category: string, payrollType: string, period: { start: Date; end: Date }, rubrics: T[]) {
  const policies = matchingFunctionalRules(records, "REGRA_INCIDENCIAS_CATEGORIA", contract, period).filter(row => row.data.category === category && row.data.payrollTypes.split(";").map(value => value.trim()).includes(payrollType));
  if (!policies.length && category === "ATIVO") return { rubrics, policy: null };
  if (policies.length !== 1) throw new Error("Configure uma única matriz de incidências para a categoria, regime e modalidade da folha.");
  const policy = policies[0];
  if (policy.startsAt > period.start || policy.endsAt && policy.endsAt.toISOString().slice(0, 10) < period.end.toISOString().slice(0, 10)) throw new Error("A matriz de incidências da categoria deve cobrir a competência integral.");
  return { policy, rubrics: rubrics.map(rubric => ({ ...rubric, incidences: rubric.incidences.map(incidence => ({ ...incidence, isIncluded: incidence.isIncluded && policy.data[incidence.incidenceType] !== "EXCLUIR" })) })) };
}
