import { and, desc, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import type { AttendanceRecord, EmploymentContract } from "@/lib/contracts/personnel";
import { hrIntegrationEvents, hrMovements, hrRightEntries } from "@/db/schema/personnel-workforce";
import { personnelJson, requireHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";
import { timeBankPolicySchema, validateTimeBankBalances } from "./time-bank";

export async function attendancePostingKey(tx: DatabaseTransaction, base: string, record: AttendanceRecord) {
  const [adjustment] = await tx.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "AJUSTE_PONTO_CONCILIADO"), eq(hrIntegrationEvents.status, "PROCESSADO"), sql`${hrIntegrationEvents.payload}->>'attendanceId' = ${record.id}`)).orderBy(desc(hrIntegrationEvents.createdAt), desc(hrIntegrationEvents.id)).limit(1);
  if (!adjustment) return base;
  const payload = z.object({ requestId: z.string(), afterUpdatedAt: z.string() }).parse(adjustment.payload);
  if (payload.afterUpdatedAt !== record.updatedAt.toISOString()) throw new Error("Ponto alterado após conciliação; revise os reflexos antes de integrar.");
  return `${base}:AJUSTE:${payload.requestId}`;
}

export async function reconcileAttendanceSources(tx: DatabaseTransaction, actorId: string, requestId: string, before: AttendanceRecord, after: AttendanceRecord, contract: EmploymentContract) {
  const baseOvertime = `PONTO:HORAS_EXTRAS:${before.id}`, baseBank = `PONTO:BANCO_HORAS:${before.id}`;
  const oldOvertimeKey = await attendancePostingKey(tx, baseOvertime, before), oldBankKey = await attendancePostingKey(tx, baseBank, before);
  const [overtime] = await tx.select().from(hrMovements).where(eq(hrMovements.sourceKey, oldOvertimeKey)).limit(1);
  const [bank] = await tx.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, oldBankKey)).limit(1);
  const references: string[] = [];
  if (overtime) {
    if (overtime.contractId !== contract.id) throw new Error("Horas extras pertencem a outro vínculo.");
    const source = await requireHrIntegrationEvent(tx, oldOvertimeKey);
    const memory = z.object({ contractId: z.string(), contractVersion: z.number(), competence: z.string(), ruleId: z.string(), policy: z.object({ origin: z.literal("HORAS_EXTRAS_PONTO"), additionalRate: z.string(), legalReference: z.string(), rubricCode: z.string() }), attendance: z.object({ updatedAt: z.string() }), hourlyValue: z.string() }).parse(source.payload);
    if (memory.attendance.updatedAt !== before.updatedAt.toISOString() || memory.contractId !== contract.id) throw new Error("Fonte de horas extras diverge do ponto original.");
    if (after.extraHours > 0 && after.status !== "Presente") throw new Error("Horas extras remuneradas exigem presença reconhecida na política de origem.");
    const hours = new Decimal(String(after.extraHours)), hourlyValue = contract.salary.div(contract.monthlyHours);
    const amount = hourlyValue.mul(hours).mul(new Decimal(1).add(new Decimal(memory.policy.additionalRate).div(100))).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const [compensation] = await tx.insert(hrMovements).values({ contractId: contract.id, sourceKey: `PORTAL:COMPENSA_EXTRA:${requestId}`, rubricCode: overtime.rubricCode, startsAt: overtime.startsAt, endsAt: overtime.endsAt, amount: overtime.amount.negated(), reference: overtime.reference, notes: `Conciliação do ponto: estorno ${overtime.id}`, actorId }).returning();
    const key = `${baseOvertime}:AJUSTE:${requestId}`;
    const [current] = await tx.insert(hrMovements).values({ contractId: contract.id, sourceKey: key, rubricCode: overtime.rubricCode, startsAt: overtime.startsAt, endsAt: overtime.endsAt, amount, reference: `${hours}h`, notes: `Ponto ${after.id} · ${memory.policy.legalReference}`, actorId }).returning();
    await enqueueHrIntegration(tx, { sourceKey: key, domain: "AUDITORIA", environment: source.environment, eventType: "HORAS_EXTRAS_CALCULADAS", payload: { contractId: contract.id, contractVersion: contract.version, competence: memory.competence, ruleId: memory.ruleId, policy: memory.policy, attendance: after, hourlyValue: hourlyValue.toString(), hours: hours.toString(), amount: amount.toFixed(2) } });
    references.push(compensation.id, current.id);
  }
  if (bank) {
    if (bank.contractId !== contract.id) throw new Error("Banco de horas pertence a outro vínculo.");
    const source = await requireHrIntegrationEvent(tx, oldBankKey);
    const memory = z.object({ contractId: z.string(), competence: z.string(), ruleId: z.string(), attendance: z.object({ updatedAt: z.string() }) }).parse(source.payload);
    const details = z.object({ policy: timeBankPolicySchema, scope: z.string(), attendanceId: z.string() }).parse(bank.details), policy = details.policy;
    if (memory.attendance.updatedAt !== before.updatedAt.toISOString()) throw new Error("Fonte do banco diverge do registro original.");
    const quantity = new Decimal(String(after.bankHours));
    if (!quantity.eq(quantity.toDecimalPlaces(4)) || quantity.gt(policy.maxCreditPerDayHours) || quantity.negated().gt(policy.maxDebitPerDayHours) || quantity.abs().gt(0) && !policy.allowedStatuses.includes(after.status) || quantity.gt(0) && policy.forbidPaidOvertimeForCredit && after.extraHours > 0) throw new Error("Ajuste incompatível com a política de banco de horas de origem.");
    const ledger = await tx.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, contract.id), eq(hrRightEntries.kind, "BANCO_HORAS"), sql`${hrRightEntries.details}->>'scope' = ${details.scope}`));
    const priorReversal = ledger.find(row => row.sourceKey === `ESTORNO:BANCO_HORAS:${bank.id}`);
    validateTimeBankBalances([...ledger.map(row => ({ date: row.periodStart, quantity: row.quantity })), { date: bank.periodStart, quantity: priorReversal ? 0 : bank.quantity.negated() }, { date: bank.periodStart, quantity }], policy.maxBalanceHours, bank.periodStart);
    const reversed = new Set(ledger.flatMap(row => { const parsed = z.object({ originalEntryId: z.string().optional() }).parse(row.details); return parsed.originalEntryId ? [parsed.originalEntryId] : []; }));
    const daily = ledger.filter(row => row.id !== bank.id && row.sourceKey.startsWith("PONTO:BANCO_HORAS:") && !reversed.has(row.id) && row.periodStart.toISOString().slice(0, 10) === bank.periodStart.toISOString().slice(0, 10));
    if (daily.reduce((sum, row) => sum.add(Decimal.max(0, row.quantity)), Decimal.max(0, quantity)).gt(policy.maxCreditPerDayHours) || daily.reduce((sum, row) => sum.sub(Decimal.min(0, row.quantity)), Decimal.max(0, quantity.negated())).gt(policy.maxDebitPerDayHours)) throw new Error("Conciliação excede o limite diário do banco de horas.");
    const compensation = priorReversal || (await tx.insert(hrRightEntries).values({ contractId: contract.id, sourceKey: `ESTORNO:BANCO_HORAS:${bank.id}`, kind: "BANCO_HORAS", periodStart: bank.periodStart, periodEnd: bank.periodEnd, quantity: bank.quantity.negated(), amount: new Decimal(0), actorId, details: personnelJson({ ...details, originalEntryId: bank.id, reason: `Conciliação funcional ${requestId}` }) }).returning())[0];
    const key = `${baseBank}:AJUSTE:${requestId}`;
    const [current] = await tx.insert(hrRightEntries).values({ contractId: contract.id, sourceKey: key, kind: "BANCO_HORAS", periodStart: bank.periodStart, periodEnd: bank.periodEnd, quantity, amount: new Decimal(0), actorId, details: personnelJson({ ...details, contractVersion: contract.version, reason: "Horas reconhecidas no ponto" }) }).returning();
    await enqueueHrIntegration(tx, { sourceKey: key, domain: "AUDITORIA", environment: source.environment, eventType: "BANCO_HORAS_RECONHECIDO", payload: { contractId: contract.id, contractVersion: contract.version, competence: memory.competence, ruleId: memory.ruleId, policy, attendance: after, quantity: quantity.toString() } });
    references.push(compensation.id, current.id);
  }
  const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:AJUSTE_PONTO:${requestId}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "AJUSTE_PONTO_CONCILIADO", payload: { requestId, attendanceId: after.id, employeeId: after.employeeId, before, afterUpdatedAt: after.updatedAt.toISOString(), after, references } });
  await tx.update(hrIntegrationEvents).set({ status: "PROCESSADO" }).where(eq(hrIntegrationEvents.id, event.id));
  return references;
}
