import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { timeBankPolicySchema, validateTimeBankBalances } from "./time-bank";
import { enqueueHrIntegration } from "./workforce-service";

const positive = z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/).refine(value => new Prisma.Decimal(value).gt(0));
export const timeBankPaymentPolicySchema = z.object({ origin: z.literal("BANCO_HORAS_PAGAMENTO"), calculation: z.literal("SALARIO_JORNADA"), multiplier: positive, maxHoursPerCompetence: positive, rubricCode: z.string().min(1), legalReference: z.string().trim().min(3).max(4000) }).strict();
const inputSchema = z.object({ sourceKey: z.string().trim().min(1).max(100), contractId: z.string().min(1), payrollId: z.string().min(1), ruleId: z.string().min(1), bankRuleId: z.string().min(1), hours: positive, reason: z.string().trim().min(10).max(2000) }).strict();
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

async function lockPaymentContext(tx: Prisma.TransactionClient, payrollId: string, contractId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${payrollId}`}))`;
  await tx.$queryRaw`SELECT id FROM "Payroll" WHERE id=${payrollId} FOR UPDATE`;
  const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId } });
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contractId}`}))`;
  const payroll = await tx.payroll.findUniqueOrThrow({ where: { id: payrollId } });
  if (payroll.type !== "Mensal" || ["Fechada", "Paga"].includes(payroll.status)) throw new Error("Conversão/estorno exige folha Mensal aberta.");
  if (await tx.hrPayrollStatement.findFirst({ where: { contract: { employeeId: initial.employeeId }, run: { mode: "OFICIAL", status: "FECHADA", payroll: { type: "Mensal", competence: payroll.competence } } }, select: { id: true } })) throw new Error("Competência oficial fechada exige conciliação própria; preserve os demonstrativos.");
  return { payroll, period: payrollPeriod(payroll.competence) };
}

export async function convertTimeBankToPayroll(db: PrismaClient, actorId: string, raw: unknown) {
  const input = inputSchema.parse(raw); input.hours = new Prisma.Decimal(input.hours).toFixed(4);
  const sourceKey = `BANCO_HORAS:PAGAMENTO:${input.sourceKey}`;
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:${sourceKey}`}))`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const payload = previous.payload as { input: unknown; entryId: string; movementId: string; amount: string };
      if (JSON.stringify(inputSchema.parse(payload.input)) !== JSON.stringify(input)) throw new Error("Origem de conversão reutilizada com outros dados.");
      return { entryId: payload.entryId, movementId: payload.movementId, amount: payload.amount };
    }
    const { payroll, period } = await lockPaymentContext(tx, input.payrollId, input.contractId);
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId }, include: { revisions: true, employee: true } });
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    if (!stored.employee.isActive || !stored.employee.personId || contract.status !== "ATIVO" || contract.admittedAt > period.start || (contract.endsAt && contract.endsAt < period.end)) throw new Error("Conversão exige vínculo ativo durante a competência integral.");
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const bankRule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.bankRuleId }, include: { ruleSet: true } });
    const policy = timeBankPaymentPolicySchema.parse(rule.value); const bankPolicy = timeBankPolicySchema.parse(bankRule.value);
    if (rule.code !== "BANCO_HORAS_PAGAMENTO" || !regime.isActive || regime.ruleSetId !== rule.ruleSetId || regime.ruleSetId !== bankRule.ruleSetId) throw new Error("Pagamento e banco exigem políticas do regime vigente.");
    for (const current of [rule, bankRule]) {
      const set = current.ruleSet;
      if (!current.isActive || set.status !== "ATIVA" || set.effectiveFrom > period.start || (set.effectiveUntil && set.effectiveUntil < period.end)) throw new Error("Políticas devem cobrir integralmente a competência.");
      if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Conversão de produção exige conjunto oficial aprovado.");
    }
    const rubric = await tx.hrPayrollRubric.findFirst({ where: { ruleSetId: rule.ruleSetId, code: policy.rubricCode, isActive: true, type: "PROVENTO", calculationMethod: "MANUAL" } });
    if (!rubric) throw new Error("Conversão exige rubrica MANUAL de provento ativa com incidências configuradas pelo RH.");
    const quantity = new Prisma.Decimal(input.hours);
    const ledger = await tx.hrRightEntry.findMany({ where: { contractId: contract.id, kind: "BANCO_HORAS", details: { path: ["scope"], equals: rule.ruleSet.scope } } });
    const alreadyConverted = ledger.filter(entry => entry.periodStart >= period.start && entry.periodStart <= period.end && ["PAGAMENTO", "ESTORNO_PAGAMENTO"].includes((entry.details as { operation?: string }).operation || "")).reduce((sum, entry) => sum.sub(entry.quantity), new Prisma.Decimal(0));
    if (alreadyConverted.add(quantity).gt(policy.maxHoursPerCompetence)) throw new Error("Conversões acumuladas excedem o limite de horas por competência.");
    validateTimeBankBalances([...ledger.map(entry => ({ date: entry.periodStart, quantity: entry.quantity })), { date: period.end, quantity: quantity.negated() }], bankPolicy.maxBalanceHours, bankRule.ruleSet.effectiveFrom);
    const amount = contract.salary.mul(quantity).div(contract.monthlyHours).mul(policy.multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (amount.lte(0)) throw new Error("Valor de conversão deve ser positivo após arredondamento.");
    const movement = await tx.hrMovement.create({ data: { contractId: contract.id, sourceKey, rubricCode: rubric.code, startsAt: period.start, endsAt: period.end, amount, actorId, reference: `${input.hours}h · ${payroll.competence}`, notes: input.reason } });
    const entry = await tx.hrRightEntry.create({ data: { contractId: contract.id, sourceKey, kind: "BANCO_HORAS", periodStart: period.end, periodEnd: period.end, quantity: quantity.negated(), amount: 0, actorId, details: json({ scope: rule.ruleSet.scope, operation: "PAGAMENTO", payrollId: payroll.id, competence: payroll.competence, movementId: movement.id, policy, bankPolicy, bankPolicyEffectiveFrom: bankRule.ruleSet.effectiveFrom, contractVersion: contract.version, salary: contract.salary.toString(), monthlyHours: contract.monthlyHours, amount: amount.toFixed(2), reason: input.reason }) } });
    const result = { entryId: entry.id, movementId: movement.id, amount: amount.toFixed(2) };
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "BANCO_HORAS_CONVERTIDO", payload: json({ input, ...result, actorId, salary: contract.salary.toString(), monthlyHours: contract.monthlyHours, policy, bankDisbursement: false }) });
    return result;
  }, { timeout: 60000 });
}

export async function reverseTimeBankPayment(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ conversionSourceKey: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:${input.conversionSourceKey}`}))`;
    const original = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: input.conversionSourceKey } });
    if (original.eventType !== "BANCO_HORAS_CONVERTIDO") throw new Error("Selecione uma conversão original.");
    const payload = z.object({ entryId: z.string(), movementId: z.string(), input: inputSchema }).parse(original.payload);
    const sourceKey = `ESTORNO:${original.sourceKey}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const memory = previous.payload as { reason: string; entryId: string; movementId: string };
      if (memory.reason !== input.reason) throw new Error("Conversão estornada com outro fundamento.");
      return { entryId: memory.entryId, movementId: memory.movementId };
    }
    await lockPaymentContext(tx, payload.input.payrollId, payload.input.contractId);
    const entry = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: payload.entryId } });
    const movement = await tx.hrMovement.findUniqueOrThrow({ where: { id: payload.movementId } });
    const details = z.object({ bankPolicy: timeBankPolicySchema, bankPolicyEffectiveFrom: z.string().datetime() }).parse(entry.details);
    const ledger = await tx.hrRightEntry.findMany({ where: { contractId: entry.contractId, kind: "BANCO_HORAS", details: { path: ["scope"], equals: original.environment } }, select: { periodStart: true, quantity: true } });
    validateTimeBankBalances([...ledger.map(row => ({ date: row.periodStart, quantity: row.quantity })), { date: entry.periodStart, quantity: entry.quantity.negated() }], details.bankPolicy.maxBalanceHours, new Date(details.bankPolicyEffectiveFrom));
    const compensation = await tx.hrMovement.create({ data: { contractId: movement.contractId, sourceKey, rubricCode: movement.rubricCode, startsAt: movement.startsAt, endsAt: movement.endsAt, amount: movement.amount.negated(), actorId, reference: `Estorno ${movement.id}`, notes: input.reason } });
    const restored = await tx.hrRightEntry.create({ data: { contractId: entry.contractId, sourceKey, kind: "BANCO_HORAS", periodStart: entry.periodStart, periodEnd: entry.periodEnd, quantity: entry.quantity.negated(), amount: 0, actorId, details: json({ scope: original.environment, operation: "ESTORNO_PAGAMENTO", originalEntryId: entry.id, movementId: compensation.id, reason: input.reason }) } });
    const result = { entryId: restored.id, movementId: compensation.id };
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "BANCO_HORAS_PAGAMENTO_ESTORNADO", payload: { ...result, originalSourceKey: original.sourceKey, actorId, reason: input.reason } });
    return result;
  }, { timeout: 60000 });
}
