import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import type { ExternalPayrollMovement } from "@/lib/contracts/personnel-external-operations";
import { enqueueHrIntegration } from "@/db/repositories/personnel/integration";
import { requireEmploymentContract, requireEmploymentHistory, requireEmploymentRegime, requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { findBenefitRubric, readActiveBenefitAssignments, readBenefitLeaves, readBenefitVacations } from "@/db/repositories/personnel-external-operations/benefits";
import { createExternalMovement, findExternalMovement, lockExternalOperation } from "@/db/repositories/personnel-external-operations/movements";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";

export const hrBenefitRuleSchema = z.object({
  kind: z.enum(["TRANSPORTE", "ALIMENTACAO"]), benefitConfigId: z.string().min(1), rubricCode: z.string().min(1),
  posting: z.enum(["PROVENTO", "DESCONTO"]), dailyValue: z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  excludeVacation: z.boolean(), excludeLeaveTypes: z.array(z.string()),
  maxEmployeeDiscountRate: z.string().regex(/^\d+(?:\.\d+)?$/).optional(),
  allowCustomMonthlyValue: z.boolean().default(false),
}).strict().superRefine((rule, context) => {
  if (new Set(rule.weekdays).size !== rule.weekdays.length) context.addIssue({ code: "custom", message: "Dias da semana duplicados." });
  if (rule.kind === "TRANSPORTE" && rule.posting === "DESCONTO" && rule.maxEmployeeDiscountRate === undefined) context.addIssue({ code: "custom", message: "Desconto VT exige percentual limite explícito." });
  if (rule.maxEmployeeDiscountRate && new Decimal(rule.maxEmployeeDiscountRate).gt(100)) context.addIssue({ code: "custom", message: "Percentual não pode exceder 100." });
});

export function calculateDailyBenefit(input: { policy: z.infer<typeof hrBenefitRuleSchema>; from: Date; until: Date; admittedAt: Date; endsAt: Date | null; salary: Decimal; absences: { from: Date; until: Date; reason: string }[]; customValue: Decimal | null }) {
  const days: { date: string; included: boolean; reason: string }[] = [];
  for (let day = new Date(input.from); day <= input.until; day = new Date(day.getTime() + 86400000)) {
    const date = day.toISOString().slice(0, 10);
    const absence = input.absences.find(absence => date >= absence.from.toISOString().slice(0, 10) && date <= absence.until.toISOString().slice(0, 10));
    const valid = day >= input.admittedAt && (!input.endsAt || day <= input.endsAt) && input.policy.weekdays.includes(day.getUTCDay()) && !absence;
    days.push({ date, included: valid, reason: absence?.reason || (valid ? "DIREITO_CONFIGURADO" : "FORA_DA_JORNADA_VINCULO") });
  }
  let total = new Decimal(input.policy.dailyValue).mul(days.filter(day => day.included).length).toDecimalPlaces(2);
  if (input.customValue !== null) {
    if (!input.policy.allowCustomMonthlyValue) throw new Error("Benefício com valor individual exige autorização na política para substituir o cálculo diário.");
    total = input.customValue;
  }
  if (!total.isFinite() || total.lt(0) || total.gt("9999999999999999.99")) throw new Error("Valor de benefício inválido.");
  const employee = input.policy.posting === "DESCONTO" && input.policy.maxEmployeeDiscountRate ? Decimal.min(total, input.salary.mul(input.policy.maxEmployeeDiscountRate).div(100)).toDecimalPlaces(2) : input.policy.posting === "DESCONTO" ? total : new Decimal(0);
  return { days, total, employee, entity: total.sub(employee), postedAmount: input.policy.posting === "PROVENTO" ? total : employee };
}

export async function generateBenefitMovement(db: DatabaseConnection, actorId: string, raw: unknown): Promise<ExternalPayrollMovement> {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), competence: z.string() }).strict().parse(raw);
  const period = payrollPeriod(input.competence);
  return withDatabaseTransaction(db, async tx => {
    const contract = await requireEmploymentContract(tx, input.contractId);
    await lockExternalOperation(tx, `RH:employee:${contract.employeeId}`);
    await lockExternalOperation(tx, `RH:contract:${contract.id}`);
    const storedContract = await requireEmploymentHistory(tx, contract.id);
    const currentContract = resolveContractRevision(storedContract, storedContract.revisions, period).contract;
    const regime = await requireEmploymentRegime(tx, currentContract.regimeId);
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = hrBenefitRuleSchema.parse(rule.value);
    if (currentContract.status !== "ATIVO" || !regime.isActive || !rule.isActive || rule.ruleSetId !== regime.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Contrato/regra de benefício devem estar ativos e vigentes na competência inteira.");
    const assignments = await readActiveBenefitAssignments(tx, contract.employeeId, policy.benefitConfigId);
    if (assignments.length !== 1) throw new Error("É necessário um único direito ativo ao benefício para este servidor.");
    const assignment = assignments[0];
    const rubric = await findBenefitRubric(tx, rule.ruleSetId, policy.rubricCode);
    if (!rubric || rubric.type !== policy.posting || rubric.calculationMethod !== "MANUAL") throw new Error("Benefício exige rubrica MANUAL ativa com sentido explícito compatível.");
    const vacations = policy.excludeVacation ? await readBenefitVacations(tx, contract.employeeId, period) : [];
    const leaves = await readBenefitLeaves(tx, contract.employeeId, policy.excludeLeaveTypes, period);
    const calculated = calculateDailyBenefit({ policy, from: period.start, until: period.end, admittedAt: currentContract.admittedAt, endsAt: currentContract.endsAt, salary: currentContract.salary, customValue: assignment.customValue === null ? null : new Decimal(String(assignment.customValue)), absences: [...vacations.map(row => ({ from: row.enjoymentStart!, until: row.enjoymentEnd!, reason: "FERIAS" })), ...leaves.map(row => ({ from: row.startDate, until: row.endDate, reason: row.type }))] });
    const sourceKey = `BENEFICIO:${assignment.id}:${input.competence}`;
    const evidence = await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "CALCULO_BENEFICIO", payload: { ...input, assignmentId: assignment.id, policy, contractVersion: currentContract.version, calculated } });
    const previous = await findExternalMovement(tx, sourceKey);
    if (previous) return previous;
    return createExternalMovement(tx, { contractId: contract.id, sourceKey, rubricCode: policy.rubricCode, startsAt: period.start, endsAt: period.end, amount: calculated.postedAmount, reference: `${calculated.days.filter(day => day.included).length} dias`, notes: `${policy.kind} · ${input.competence} · evidência ${evidence.id}`, actorId });
  });
}
