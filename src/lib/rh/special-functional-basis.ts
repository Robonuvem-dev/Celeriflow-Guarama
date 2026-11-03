import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrMovements } from "@/db/schema/personnel-workforce";
import { requireEmploymentHolderHistory, requireEmploymentRegime } from "@/db/repositories/personnel/workforce";
import type { EmploymentContract } from "@/lib/contracts/personnel";
import type { FunctionalRecord } from "./functional-record-service";
import { matchingFunctionalRules } from "./functional-payroll";
import { calculateFunctionalMonthlyRubrics } from "./absence-payroll";
import { resolveMonthlyContractSegments } from "./monthly-proration";
import { HR_PAYROLL_TYPES, payrollPeriod, type PayrollRubricInput } from "./calculation-engine";
import { automaticServiceAllowances } from "./automatic-service-rights";
import { calculateBeneficiaryMonthlyRubrics } from "./beneficiary-monthly-payroll";

export async function specialFunctionalBasis(db: DatabaseExecutor, contract: EmploymentContract, records: FunctionalRecord[], input: { payrollType: string; competence: string; referenceDate?: string; rubrics: PayrollRubricInput[] }) {
  const period = payrollPeriod(input.competence), reference = input.referenceDate ? new Date(`${input.referenceDate}T00:00:00Z`) : new Date(period.end.toISOString().slice(0, 10));
  const policies = matchingFunctionalRules(records, "BASE_FOLHA_ESPECIAL", contract, { start: reference, end: reference }).filter(record => record.data.payrollTypes.split(";").map(value => value.trim()).includes(input.payrollType));
  const beneficiary = records.some(record => record.kind === "CATEGORIA_FOLHA" && record.data.category !== "ATIVO");
  const effects = records.filter(record => ["COMISSAO", "AFASTAMENTO", "CESSAO", ...(beneficiary ? ["REGRA_LIMITE_BENEFICIO"] : ["REGRA_LIMITE", "HORA_AULA"])].includes(record.kind));
  if (beneficiary && effects.some(record => record.kind !== "REGRA_LIMITE_BENEFICIO")) throw new Error("A base especial de benefício exige efeitos próprios do vínculo previdenciário.");
  if (!beneficiary && !effects.length && !policies.length) return null;
  if (policies.length !== 1) throw new Error("Configure uma única base remuneratória da modalidade especial para conciliar efeitos funcionais.");
  const policy = policies[0], types = policy.data.payrollTypes.split(";").map(value => value.trim());
  if (types.some(type => !(HR_PAYROLL_TYPES as readonly string[]).includes(type) || type === "Mensal")) throw new Error("Modalidades inválidas na base de folha especial.");
  const codes = [...new Set(policy.data.rubricCodes.split(",").map(value => value.trim()).filter(Boolean))];
  if (!codes.length || codes.some(code => !input.rubrics.some(rubric => rubric.code === code && rubric.type === "PROVENTO") || code.startsWith("POC_"))) throw new Error("Selecione rubricas remuneratórias de origem, sem incluir as parcelas geradas pela própria folha especial.");
  const stored = await requireEmploymentHolderHistory(db, contract.id);
  const segments = resolveMonthlyContractSegments(stored, stored.revisions, period, true).filter(segment => segment.start <= reference).map(segment => ({ ...segment, end: new Date(Math.min(segment.end.getTime(), reference.getTime())) }));
  if (!segments.length) throw new Error("Sem exercício contratual na referência remuneratória especial.");
  const movements = await db.select().from(hrMovements).where(and(eq(hrMovements.contractId, contract.id), lte(hrMovements.startsAt, reference), or(sql`${hrMovements.endsAt} IS NULL`, gte(hrMovements.endsAt, period.start))));
  const regime = await requireEmploymentRegime(db, contract.regimeId);
  const automatic = beneficiary ? { memory: [] } : await automaticServiceAllowances(db, contract, matchingFunctionalRules(records, "REGRA_ATS", contract, period), period, regime.ruleSet.scope);
  const dailyMovements: Record<string, Record<string, Decimal>> = {};
  for (const segment of segments) for (let at = segment.start.getTime(); at <= segment.end.getTime(); at += 86400000) {
    const date = new Date(at), key = date.toISOString().slice(0, 10);
    const amounts: Record<string, Decimal> = {};
    for (const movement of movements) if (movement.startsAt <= date && (!movement.endsAt || movement.endsAt >= date)) amounts[movement.rubricCode] = (amounts[movement.rubricCode] ?? new Decimal(0)).add(movement.amount);
    dailyMovements[key] = amounts;
  }
  for (const allowance of automatic.memory) {
    for (const daily of allowance.dailyRates) {
      const date = new Date(`${daily.date}T00:00:00Z`), segment = segments.find(row => row.start <= date && row.end >= date);
      if (!segment) continue;
      if (dailyMovements[daily.date]?.[allowance.rubricCode]?.gt(0)) throw new Error("Base especial possui ATS automático e lançamento manual concorrente na mesma data.");
      dailyMovements[daily.date] ??= {};
      dailyMovements[daily.date][allowance.rubricCode] = new Decimal(daily.monthlyAmount);
    }
  }
  const assessmentInput = { contract, revisionId: segments.at(-1)!.revisionId, segments, period, rubrics: input.rubrics, movements: {}, dailyMovements };
  const assessment = beneficiary ? calculateBeneficiaryMonthlyRubrics({ ...assessmentInput, records }) : calculateFunctionalMonthlyRubrics({ ...assessmentInput, records: effects });
  const sum = (items: Array<{ code: string; value: string }>) => items.filter(item => codes.includes(item.code)).reduce((total, item) => total.add(item.value), new Decimal(0));
  const remuneration = policy.data.referenceMode === "DATA_REFERENCIA" ? sum(assessment.referenceResults.at(-1)!.items) : assessment.referenceResults.reduce((total, result) => total.add(sum(result.items)), new Decimal(0)).div(assessment.referenceResults.length);
  return { remuneration: remuneration.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), salaryBalance: sum(assessment.result.items), memory: { policyId: policy.id, policyVersion: policy.version, referenceDate: reference.toISOString().slice(0, 10), mode: policy.data.referenceMode, codes, remuneration: remuneration.toFixed(2), salaryBalance: sum(assessment.result.items).toFixed(2), balanceProration: "CALENDARIO_CIVIL", legalReference: policy.data.legalReference, sourceMovements: movements, automaticServiceAllowances: automatic.memory, dailyEffects: assessment.memory } };
}
