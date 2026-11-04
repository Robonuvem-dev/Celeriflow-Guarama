import { Decimal } from "@/db/decimal";
import type { FunctionalRecord } from "./functional-record-service";
import { matchingFunctionalRules } from "./functional-payroll";
import { HR_PAYROLL_TYPES } from "./calculation-engine";

export function resolveBeneficiaryContribution(records: FunctionalRecord[], contract: { regimeId: string; roleId: string }, category: string, payrollType: string, period: { start: Date; end: Date }) {
  if (category === "ATIVO") return null;
  const policies = matchingFunctionalRules(records, "REGRA_PREVIDENCIA_BENEFICIO", contract, period).filter(row => row.data.category === category && row.data.payrollTypes.split(";").map(value => value.trim()).includes(payrollType));
  if (policies.length !== 1) throw new Error("Configure uma única regra contributiva da categoria de benefício e modalidade da folha.");
  const policy = policies[0];
  if (policy.startsAt > period.start || policy.endsAt && policy.endsAt.toISOString().slice(0, 10) < period.end.toISOString().slice(0, 10)) throw new Error("Regra contributiva do benefício deve cobrir a competência integral.");
  if (policy.data.payrollTypes.split(";").some(value => !(HR_PAYROLL_TYPES as readonly string[]).includes(value.trim()))) throw new Error("Modalidade inválida na regra contributiva do benefício.");
  if (policy.data.ceilingMode === "VALOR" && (!policy.data.ceiling || new Decimal(policy.data.ceiling).lte(0))) throw new Error("Informe o teto contributivo positivo do benefício.");
  return policy;
}

/** Exemption is applied once to the total person/category base, never once per contract. */
export function beneficiaryTaxableBase(base: Decimal, policy: FunctionalRecord | null) {
  if (!policy) return base;
  if (policy.data.personalMode === "ISENTO") return new Decimal(0);
  return policy.data.personalMode === "EXCEDENTE" ? Decimal.max(0, base.sub(policy.data.exemptAmount)) : base;
}
