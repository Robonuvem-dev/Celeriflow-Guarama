import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { timeBankPolicySchema, validateTimeBankBalances } from "./time-bank";
import { enqueueHrIntegration } from "./workforce-service";

const hours = z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/).refine(value => new Prisma.Decimal(value).gt(0), "Horas devem ser positivas.");
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data civil inválida.");
const requestSchema = z.object({ sourceKey: z.string().trim().min(1).max(140), sourceContractId: z.string().min(1), targetContractId: z.string().min(1), ruleId: z.string().min(1), sourceBankRuleId: z.string().min(1), targetBankRuleId: z.string().min(1), date: civil, hours, reason: z.string().trim().min(10).max(4000) }).strict();
export const timeBankTransferPolicySchema = z.object({ origin: z.literal("BANCO_HORAS_TRANSFERENCIA"), conversion: z.literal("HORA_POR_HORA"), maxTransferHours: hours, allowedRegimePairs: z.array(z.object({ sourceRegimeId: z.string().min(1), targetRegimeId: z.string().min(1) }).strict()).min(1).max(100), legalReference: z.string().trim().min(3).max(4000) }).strict();
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

async function lockContracts(tx: Prisma.TransactionClient, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("Transferência exige contratos distintos.");
  const initial = await tx.hrEmploymentContract.findMany({ where: { id: { in: [sourceId, targetId] } }, select: { id: true, employeeId: true } });
  if (initial.length !== 2 || initial[0].employeeId !== initial[1].employeeId) throw new Error("Transferência exige dois vínculos da mesma identidade funcional.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial[0].employeeId}`}))`;
  for (const id of [sourceId, targetId].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${id}`}))`;
  return initial[0].employeeId;
}

async function validateLeg(tx: Prisma.TransactionClient, contractId: string, scope: string, date: Date, quantity: Prisma.Decimal, maximum: string, limitFrom: Date) {
  const ledger = await tx.hrRightEntry.findMany({ where: { contractId, kind: "BANCO_HORAS", details: { path: ["scope"], equals: scope } }, select: { periodStart: true, quantity: true } });
  // Check the entire timeline: a transfer must not invalidate a debit already
  // scheduled after this date, or use credit scheduled after the transfer.
  validateTimeBankBalances([...ledger.map(entry => ({ date: entry.periodStart, quantity: entry.quantity })), { date, quantity }], maximum, limitFrom);
}

export async function transferTimeBank(db: PrismaClient, actorId: string, raw: unknown) {
  const input = requestSchema.parse(raw);
  input.hours = new Prisma.Decimal(input.hours).toFixed(4);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  const sourceKey = `BANCO_HORAS:TRANSFERENCIA:${input.sourceKey}`;
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:${sourceKey}`}))`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const payload = previous.payload as { input: unknown; sourceEntryId: string; targetEntryId: string };
      if (previous.eventType !== "BANCO_HORAS_TRANSFERIDO" || JSON.stringify(requestSchema.parse(payload.input)) !== JSON.stringify(input)) throw new Error("Origem de transferência reutilizada com outros dados.");
      return { sourceEntryId: payload.sourceEntryId, targetEntryId: payload.targetEntryId };
    }
    const employeeId = await lockContracts(tx, input.sourceContractId, input.targetContractId);
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
    if (!employee.isActive || !employee.personId) throw new Error("Titular deve estar ativo e vinculado ao Cadastro Único.");
    const stored = await tx.hrEmploymentContract.findMany({ where: { id: { in: [input.sourceContractId, input.targetContractId] } }, include: { revisions: true } });
    const source = resolveContractRevision(stored.find(row => row.id === input.sourceContractId)!, stored.find(row => row.id === input.sourceContractId)!.revisions, { start: date, end: date }).contract;
    const target = resolveContractRevision(stored.find(row => row.id === input.targetContractId)!, stored.find(row => row.id === input.targetContractId)!.revisions, { start: date, end: date }).contract;
    for (const contract of [source, target]) if (contract.status !== "ATIVO" || date < contract.admittedAt || (contract.endsAt && date > contract.endsAt)) throw new Error("Transferência fora da vigência ativa de um dos contratos.");
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const policy = timeBankTransferPolicySchema.parse(rule.value);
    const quantity = new Prisma.Decimal(input.hours);
    if (rule.code !== "BANCO_HORAS_TRANSFERENCIA" || quantity.gt(policy.maxTransferHours) || !policy.allowedRegimePairs.some(pair => pair.sourceRegimeId === source.regimeId && pair.targetRegimeId === target.regimeId)) throw new Error("Quantidade ou par de regimes não autorizado na política de transferência.");
    const legs = [];
    for (const [contract, bankRuleId, signedQuantity, direction] of [[source, input.sourceBankRuleId, quantity.negated(), "SAIDA"], [target, input.targetBankRuleId, quantity, "ENTRADA"]] as const) {
      const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
      const bankRule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: bankRuleId }, include: { ruleSet: true } });
      const bankPolicy = timeBankPolicySchema.parse(bankRule.value);
      if (!regime.isActive || regime.ruleSetId !== bankRule.ruleSetId || bankRule.ruleSet.scope !== rule.ruleSet.scope) throw new Error("Políticas de banco e regimes devem pertencer ao mesmo escopo da transferência.");
      for (const policyRule of [rule, bankRule]) {
        const set = policyRule.ruleSet;
        if (!policyRule.isActive || set.status !== "ATIVA" || set.effectiveFrom > date || (set.effectiveUntil && set.effectiveUntil < date)) throw new Error("Política de transferência/banco fora da vigência ativa.");
        if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Transferência de produção exige políticas oficiais aprovadas.");
      }
      await validateLeg(tx, contract.id, rule.ruleSet.scope, date, signedQuantity, bankPolicy.maxBalanceHours, bankRule.ruleSet.effectiveFrom);
      legs.push({ contract, bankRule, bankPolicy, signedQuantity, direction });
    }
    const entryIds = [];
    for (const leg of legs) {
      const entry = await tx.hrRightEntry.create({ data: { contractId: leg.contract.id, kind: "BANCO_HORAS", sourceKey: `${sourceKey}:${leg.direction}`, periodStart: date, periodEnd: date, quantity: leg.signedQuantity, amount: 0, actorId, details: json({ scope: rule.ruleSet.scope, operation: "TRANSFERENCIA", transferSourceKey: sourceKey, direction: leg.direction, otherContractId: leg.direction === "SAIDA" ? target.id : source.id, contractVersion: leg.contract.version, ruleId: rule.id, policy, bankRuleId: leg.bankRule.id, bankPolicy: leg.bankPolicy, bankPolicyEffectiveFrom: leg.bankRule.ruleSet.effectiveFrom, reason: input.reason }) } });
      entryIds.push(entry.id);
    }
    const result = { sourceEntryId: entryIds[0], targetEntryId: entryIds[1] };
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "BANCO_HORAS_TRANSFERIDO", payload: json({ input, employeeId, actorId, ...result, policy, affectsPayroll: false }) });
    return result;
  }, { timeout: 60000 });
}

export async function reverseTimeBankTransfer(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ transferSourceKey: z.string().trim().min(1), reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:${input.transferSourceKey}`}))`;
    const original = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: input.transferSourceKey } });
    if (original.eventType !== "BANCO_HORAS_TRANSFERIDO") throw new Error("Selecione uma transferência original.");
    const payload = z.object({ sourceEntryId: z.string(), targetEntryId: z.string() }).parse(original.payload);
    const sourceKey = `ESTORNO:${original.sourceKey}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const memory = previous.payload as { reason: string; entryIds: string[] };
      if (memory.reason !== input.reason) throw new Error("Transferência estornada com outro fundamento.");
      return { entryIds: memory.entryIds };
    }
    const entries = await tx.hrRightEntry.findMany({ where: { id: { in: [payload.sourceEntryId, payload.targetEntryId] } } });
    if (entries.length !== 2 || entries.some(entry => entry.kind !== "BANCO_HORAS" || entry.amount.toString() !== "0") || !entries[0].quantity.add(entries[1].quantity).isZero()) throw new Error("Pernas da transferência inconsistentes; concilie o histórico.");
    await lockContracts(tx, entries[0].contractId, entries[1].contractId);
    const entryIds = [];
    for (const originalEntry of entries) {
      const details = z.object({ scope: z.string(), transferSourceKey: z.literal(original.sourceKey), bankPolicy: timeBankPolicySchema, bankPolicyEffectiveFrom: z.string().datetime() }).parse(originalEntry.details);
      const quantity = originalEntry.quantity.negated();
      await validateLeg(tx, originalEntry.contractId, details.scope, originalEntry.periodStart, quantity, details.bankPolicy.maxBalanceHours, new Date(details.bankPolicyEffectiveFrom));
      const entry = await tx.hrRightEntry.create({ data: { contractId: originalEntry.contractId, sourceKey: `${sourceKey}:${originalEntry.id}`, kind: "BANCO_HORAS", periodStart: originalEntry.periodStart, periodEnd: originalEntry.periodEnd, quantity, amount: 0, actorId, details: json({ ...details, operation: "ESTORNO_TRANSFERENCIA", originalEntryId: originalEntry.id, reason: input.reason }) } });
      entryIds.push(entry.id);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "BANCO_HORAS_TRANSFERENCIA_ESTORNADA", payload: { originalSourceKey: original.sourceKey, entryIds, actorId, reason: input.reason } });
    return { entryIds };
  }, { timeout: 60000 });
}
