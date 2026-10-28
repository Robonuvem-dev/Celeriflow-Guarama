import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { hrEmploymentContracts, hrRightEntries } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel, personnelJson as json, requireHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { listEmploymentContracts, requireEmployeeWithPerson, requireEmploymentRegime, requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { timeBankPolicySchema, validateTimeBankBalances } from "./time-bank";
import { enqueueHrIntegration } from "./workforce-service";

const hours = z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/).refine(value => new Decimal(value).gt(0), "Horas devem ser positivas.");
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data civil inválida.");
const requestSchema = z.object({ sourceKey: z.string().trim().min(1).max(140), sourceContractId: z.string().min(1), targetContractId: z.string().min(1), ruleId: z.string().min(1), sourceBankRuleId: z.string().min(1), targetBankRuleId: z.string().min(1), date: civil, hours, reason: z.string().trim().min(10).max(4000) }).strict();
export const timeBankTransferPolicySchema = z.object({ origin: z.literal("BANCO_HORAS_TRANSFERENCIA"), conversion: z.literal("HORA_POR_HORA"), maxTransferHours: hours, allowedRegimePairs: z.array(z.object({ sourceRegimeId: z.string().min(1), targetRegimeId: z.string().min(1) }).strict()).min(1).max(100), legalReference: z.string().trim().min(3).max(4000) }).strict();

async function lockContracts(tx: DatabaseTransaction, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("Transferência exige contratos distintos.");
  const initial = await tx.select({ id: hrEmploymentContracts.id, employeeId: hrEmploymentContracts.employeeId }).from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, [sourceId, targetId]));
  if (initial.length !== 2 || initial[0].employeeId !== initial[1].employeeId) throw new Error("Transferência exige dois vínculos da mesma identidade funcional.");
  await lockPersonnel(tx, `employee:${initial[0].employeeId}`);
  for (const id of [sourceId, targetId].sort()) await lockPersonnel(tx, `contract:${id}`);
  return initial[0].employeeId;
}

async function validateLeg(tx: DatabaseExecutor, contractId: string, scope: string, date: Date, quantity: Decimal, maximum: string, limitFrom: Date) {
  const ledger = await tx.select({ periodStart: hrRightEntries.periodStart, quantity: hrRightEntries.quantity }).from(hrRightEntries).where(and(eq(hrRightEntries.contractId, contractId), eq(hrRightEntries.kind, "BANCO_HORAS"), sql`${hrRightEntries.details}->>'scope' = ${scope}`));
  // Check the entire timeline: a transfer must not invalidate a debit already
  // scheduled after this date, or use credit scheduled after the transfer.
  validateTimeBankBalances([...ledger.map(entry => ({ date: entry.periodStart, quantity: entry.quantity })), { date, quantity }], maximum, limitFrom);
}

export async function transferTimeBank(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = requestSchema.parse(raw);
  input.hours = new Decimal(input.hours).toFixed(4);
  const date = new Date(`${input.date}T00:00:00.000Z`);
  const sourceKey = `BANCO_HORAS:TRANSFERENCIA:${input.sourceKey}`;
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, sourceKey);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const payload = previous.payload as { input: unknown; sourceEntryId: string; targetEntryId: string };
      if (previous.eventType !== "BANCO_HORAS_TRANSFERIDO" || JSON.stringify(requestSchema.parse(payload.input)) !== JSON.stringify(input)) throw new Error("Origem de transferência reutilizada com outros dados.");
      return { sourceEntryId: payload.sourceEntryId, targetEntryId: payload.targetEntryId };
    }
    const employeeId = await lockContracts(tx, input.sourceContractId, input.targetContractId);
    const employee = await requireEmployeeWithPerson(tx, employeeId);
    if (!employee.isActive || !employee.personId) throw new Error("Titular deve estar ativo e vinculado ao Cadastro Único.");
    const stored = await listEmploymentContracts(tx, inArray(hrEmploymentContracts.id, [input.sourceContractId, input.targetContractId]));
    const source = resolveContractRevision(stored.find(row => row.id === input.sourceContractId)!, stored.find(row => row.id === input.sourceContractId)!.revisions, { start: date, end: date }).contract;
    const target = resolveContractRevision(stored.find(row => row.id === input.targetContractId)!, stored.find(row => row.id === input.targetContractId)!.revisions, { start: date, end: date }).contract;
    for (const contract of [source, target]) if (contract.status !== "ATIVO" || date < contract.admittedAt || (contract.endsAt && date > contract.endsAt)) throw new Error("Transferência fora da vigência ativa de um dos contratos.");
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = timeBankTransferPolicySchema.parse(rule.value);
    const quantity = new Decimal(input.hours);
    if (rule.code !== "BANCO_HORAS_TRANSFERENCIA" || quantity.gt(policy.maxTransferHours) || !policy.allowedRegimePairs.some(pair => pair.sourceRegimeId === source.regimeId && pair.targetRegimeId === target.regimeId)) throw new Error("Quantidade ou par de regimes não autorizado na política de transferência.");
    const legs = [];
    for (const [contract, bankRuleId, signedQuantity, direction] of [[source, input.sourceBankRuleId, quantity.negated(), "SAIDA"], [target, input.targetBankRuleId, quantity, "ENTRADA"]] as const) {
      const regime = await requireEmploymentRegime(tx, contract.regimeId);
      const bankRule = await requirePayrollRule(tx, bankRuleId);
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
      const [entry] = await tx.insert(hrRightEntries).values({ contractId: leg.contract.id, kind: "BANCO_HORAS", sourceKey: `${sourceKey}:${leg.direction}`, periodStart: date, periodEnd: date, quantity: leg.signedQuantity, amount: new Decimal(0), actorId, details: json({ scope: rule.ruleSet.scope, operation: "TRANSFERENCIA", transferSourceKey: sourceKey, direction: leg.direction, otherContractId: leg.direction === "SAIDA" ? target.id : source.id, contractVersion: leg.contract.version, ruleId: rule.id, policy, bankRuleId: leg.bankRule.id, bankPolicy: leg.bankPolicy, bankPolicyEffectiveFrom: leg.bankRule.ruleSet.effectiveFrom, reason: input.reason }) }).returning();
      entryIds.push(entry.id);
    }
    const result = { sourceEntryId: entryIds[0], targetEntryId: entryIds[1] };
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "BANCO_HORAS_TRANSFERIDO", payload: json({ input, employeeId, actorId, ...result, policy, affectsPayroll: false }) });
    return result;
  }, { timeoutMs: 60000 });
}

export async function reverseTimeBankTransfer(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ transferSourceKey: z.string().trim().min(1), reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, input.transferSourceKey);
    const original = await requireHrIntegrationEvent(tx, input.transferSourceKey);
    if (original.eventType !== "BANCO_HORAS_TRANSFERIDO") throw new Error("Selecione uma transferência original.");
    const payload = z.object({ sourceEntryId: z.string(), targetEntryId: z.string() }).parse(original.payload);
    const sourceKey = `ESTORNO:${original.sourceKey}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const memory = previous.payload as { reason: string; entryIds: string[] };
      if (memory.reason !== input.reason) throw new Error("Transferência estornada com outro fundamento.");
      return { entryIds: memory.entryIds };
    }
    const entries = await tx.select().from(hrRightEntries).where(inArray(hrRightEntries.id, [payload.sourceEntryId, payload.targetEntryId]));
    if (entries.length !== 2 || entries.some(entry => entry.kind !== "BANCO_HORAS" || entry.amount.toString() !== "0") || !entries[0].quantity.add(entries[1].quantity).isZero()) throw new Error("Pernas da transferência inconsistentes; concilie o histórico.");
    await lockContracts(tx, entries[0].contractId, entries[1].contractId);
    const entryIds = [];
    for (const originalEntry of entries) {
      const details = z.object({ scope: z.string(), transferSourceKey: z.literal(original.sourceKey), bankPolicy: timeBankPolicySchema, bankPolicyEffectiveFrom: z.string().datetime() }).parse(originalEntry.details);
      const quantity = originalEntry.quantity.negated();
      await validateLeg(tx, originalEntry.contractId, details.scope, originalEntry.periodStart, quantity, details.bankPolicy.maxBalanceHours, new Date(details.bankPolicyEffectiveFrom));
      const [entry] = await tx.insert(hrRightEntries).values({ contractId: originalEntry.contractId, sourceKey: `${sourceKey}:${originalEntry.id}`, kind: "BANCO_HORAS", periodStart: originalEntry.periodStart, periodEnd: originalEntry.periodEnd, quantity, amount: new Decimal(0), actorId, details: json({ ...details, operation: "ESTORNO_TRANSFERENCIA", originalEntryId: originalEntry.id, reason: input.reason }) }).returning();
      entryIds.push(entry.id);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "BANCO_HORAS_TRANSFERENCIA_ESTORNADA", payload: { originalSourceKey: original.sourceKey, entryIds, actorId, reason: input.reason } });
    return { entryIds };
  }, { timeoutMs: 60000 });
}
