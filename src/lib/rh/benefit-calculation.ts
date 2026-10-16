import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { enqueueHrIntegration } from "./workforce-service";
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
  if (rule.maxEmployeeDiscountRate && new Prisma.Decimal(rule.maxEmployeeDiscountRate).gt(100)) context.addIssue({ code: "custom", message: "Percentual não pode exceder 100." });
});

export function calculateDailyBenefit(input: { policy: z.infer<typeof hrBenefitRuleSchema>; from: Date; until: Date; admittedAt: Date; endsAt: Date | null; salary: Prisma.Decimal; absences: { from: Date; until: Date; reason: string }[]; customValue: Prisma.Decimal | null }) {
  const days: { date: string; included: boolean; reason: string }[] = [];
  for (let day = new Date(input.from); day <= input.until; day = new Date(day.getTime() + 86400000)) {
    const date = day.toISOString().slice(0, 10);
    const absence = input.absences.find(absence => date >= absence.from.toISOString().slice(0, 10) && date <= absence.until.toISOString().slice(0, 10));
    const valid = day >= input.admittedAt && (!input.endsAt || day <= input.endsAt) && input.policy.weekdays.includes(day.getUTCDay()) && !absence;
    days.push({ date, included: valid, reason: absence?.reason || (valid ? "DIREITO_CONFIGURADO" : "FORA_DA_JORNADA_VINCULO") });
  }
  let total = new Prisma.Decimal(input.policy.dailyValue).mul(days.filter(day => day.included).length).toDecimalPlaces(2);
  if (input.customValue !== null) {
    if (!input.policy.allowCustomMonthlyValue) throw new Error("Benefício com valor individual exige autorização na política para substituir o cálculo diário.");
    total = input.customValue;
  }
  if (!total.isFinite() || total.lt(0) || total.gt("9999999999999999.99")) throw new Error("Valor de benefício inválido.");
  const employee = input.policy.posting === "DESCONTO" && input.policy.maxEmployeeDiscountRate ? Prisma.Decimal.min(total, input.salary.mul(input.policy.maxEmployeeDiscountRate).div(100)).toDecimalPlaces(2) : input.policy.posting === "DESCONTO" ? total : new Prisma.Decimal(0);
  return { days, total, employee, entity: total.sub(employee), postedAmount: input.policy.posting === "PROVENTO" ? total : employee };
}

export async function generateBenefitMovement(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), competence: z.string() }).strict().parse(raw);
  const period = payrollPeriod(input.competence);
  return db.$transaction(async tx => {
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    const storedContract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contract.id }, include: { revisions: true } });
    const currentContract = resolveContractRevision(storedContract, storedContract.revisions, period).contract;
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: currentContract.regimeId } });
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const policy = hrBenefitRuleSchema.parse(rule.value);
    if (currentContract.status !== "ATIVO" || !regime.isActive || !rule.isActive || rule.ruleSetId !== regime.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Contrato/regra de benefício devem estar ativos e vigentes na competência inteira.");
    const assignments = await tx.payrollBenefit.findMany({ where: { employeeId: contract.employeeId, benefitConfigId: policy.benefitConfigId, status: "Ativo", benefitConfig: { isActive: true } } });
    if (assignments.length !== 1) throw new Error("É necessário um único direito ativo ao benefício para este servidor.");
    const assignment = assignments[0];
    const rubric = await tx.hrPayrollRubric.findFirst({ where: { ruleSetId: rule.ruleSetId, code: policy.rubricCode, isActive: true } });
    if (!rubric || rubric.type !== policy.posting || rubric.calculationMethod !== "MANUAL") throw new Error("Benefício exige rubrica MANUAL ativa com sentido explícito compatível.");
    const vacations = policy.excludeVacation ? await tx.vacation.findMany({ where: { employeeId: contract.employeeId, status: { in: ["Programada", "Em gozo", "Concluída"] }, enjoymentStart: { lte: period.end }, enjoymentEnd: { gte: period.start } } }) : [];
    const leaves = await tx.leave.findMany({ where: { employeeId: contract.employeeId, status: "Ativa", type: { in: policy.excludeLeaveTypes }, startDate: { lte: period.end }, endDate: { gte: period.start } } });
    const calculated = calculateDailyBenefit({ policy, from: period.start, until: period.end, admittedAt: currentContract.admittedAt, endsAt: currentContract.endsAt, salary: currentContract.salary, customValue: assignment.customValue === null ? null : new Prisma.Decimal(String(assignment.customValue)), absences: [...vacations.map(row => ({ from: row.enjoymentStart!, until: row.enjoymentEnd!, reason: "FERIAS" })), ...leaves.map(row => ({ from: row.startDate, until: row.endDate, reason: row.type }))] });
    const sourceKey = `BENEFICIO:${assignment.id}:${input.competence}`;
    const evidence = await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "CALCULO_BENEFICIO", payload: { ...input, assignmentId: assignment.id, policy, contractVersion: currentContract.version, calculated } });
    const previous = await tx.hrMovement.findUnique({ where: { sourceKey } });
    if (previous) return previous;
    return tx.hrMovement.create({ data: { contractId: contract.id, sourceKey, rubricCode: policy.rubricCode, startsAt: period.start, endsAt: period.end, amount: calculated.postedAmount, reference: `${calculated.days.filter(day => day.included).length} dias`, notes: `${policy.kind} · ${input.competence} · evidência ${evidence.id}`, actorId } });
  });
}
