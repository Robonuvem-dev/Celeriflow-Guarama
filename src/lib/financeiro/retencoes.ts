import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { listActiveRetentionRules } from "@/db/repositories/finance/settlements";

export type RetentionRuleInput = {
  type: string;
  description?: string;
  calculationBasePercentage: Decimal | number;
  ratePercentage: Decimal | number;
};

type RetentionRuleCriteria = {
  financialYearId: string;
  date: Date;
  serviceCode?: string;
  ruleIds?: string[];
};

function percentage(value: Decimal | number, field: string) {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.lessThan(0) || decimal.greaterThan(100)) {
    throw new Error(`${field} deve estar entre 0% e 100%.`);
  }
  return decimal;
}

export function calculateRetentions(
  grossValue: Decimal | number,
  rules: RetentionRuleInput[],
) {
  const gross = new Decimal(grossValue);
  if (!gross.isFinite() || gross.lessThanOrEqualTo(0)) {
    throw new Error("O valor bruto deve ser maior que zero para calcular retenções.");
  }

  return rules.map((rule) => {
    const calculationBasePercentage = percentage(rule.calculationBasePercentage, "A base de cálculo da retenção");
    const ratePercentage = percentage(rule.ratePercentage, "A alíquota da retenção");
    const base = gross.mul(calculationBasePercentage).div(100);
    const retainedValue = base.mul(ratePercentage).div(100).toDecimalPlaces(2);

    return {
      type: rule.type,
      baseValue: base.toDecimalPlaces(2),
      retainedValue,
      ratePercentage,
    };
  });
}

export async function getActiveRetentionRules(tx: DatabaseExecutor, criteria: RetentionRuleCriteria) {
  if (Number.isNaN(criteria.date.getTime())) throw new Error("Data de referência inválida para cálculo de retenções.");

  const ruleIds = [...new Set(criteria.ruleIds ?? [])];
  const rules = await listActiveRetentionRules(tx, { ...criteria, ruleIds });

  if (ruleIds.length !== rules.length) {
    throw new Error("Uma ou mais regras de retenção estão inativas, vencidas ou não se aplicam ao serviço e exercício informados.");
  }
  return rules;
}

export function calculateRetentionDueDate(referenceDate: Date, dueDays: number | null) {
  if (!dueDays) return undefined;
  const dueDate = new Date(referenceDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + dueDays);
  return dueDate;
}
