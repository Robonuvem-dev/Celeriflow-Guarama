import { Prisma, type PrismaClient, type AttendanceRecord } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";
import { attendancePostingKey } from "./attendance-reconciliation";

const policySchema = z.object({ origin: z.literal("BANCO_HORAS_PONTO"), maxBalanceHours: z.string().regex(/^\d+(?:\.\d{1,4})?$/), maxCreditPerDayHours: z.string().regex(/^\d+(?:\.\d{1,4})?$/), maxDebitPerDayHours: z.string().regex(/^\d+(?:\.\d{1,4})?$/), allowedStatuses: z.array(z.string().min(1)).min(1), forbidPaidOvertimeForCredit: z.boolean(), legalReference: z.string().trim().min(3) }).strict();
export const timeBankPolicySchema = policySchema;

/** Grouping by civil day allows distinct origins on the same approved day,
 * while a later credit can never finance a deficit on an earlier day. */
export function validateTimeBankBalances(entries: { date: Date; quantity: Prisma.Decimal.Value }[], maximum: Prisma.Decimal.Value, limitFrom?: Date) {
  const cap = new Prisma.Decimal(maximum);
  if (!cap.isFinite() || cap.lt(0)) throw new Error("Limite de banco de horas inválido.");
  const grouped = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    const day = entry.date.toISOString().slice(0, 10); const value = new Prisma.Decimal(entry.quantity);
    if (!value.isFinite()) throw new Error("Quantidade de horas inválida.");
    grouped.set(day, (grouped.get(day) || new Prisma.Decimal(0)).add(value));
  }
  let balance = new Prisma.Decimal(0);
  for (const [day, quantity] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    balance = balance.add(quantity);
    if (balance.lt(0)) throw new Error(`Débito excede saldo de horas em ${day}; créditos futuros não cobrem saldo anterior.`);
    if ((!limitFrom || day >= limitFrom.toISOString().slice(0, 10)) && balance.gt(cap)) throw new Error(`Saldo de horas excede limite da política em ${day}.`);
  }
  return balance;
}

export async function generateAttendanceTimeBank(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), competence: z.string() }).strict().parse(raw);
  const period = payrollPeriod(input.competence);
  return db.$transaction(async tx => {
    const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${initial.id}`}))`;
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: initial.id }, include: { revisions: true } });
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const policy = policySchema.parse(rule.value);
    if (!rule.isActive || !regime.isActive || contract.status !== "ATIVO" || regime.ruleSetId !== rule.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Política/regime de banco de horas devem cobrir a competência.");
    if (rule.ruleSet.scope === "PRODUCAO" && (rule.ruleSet.isDemo || !rule.ruleSet.approvedAt || rule.ruleSet.approvedAt > new Date() || !rule.ruleSet.legalReference)) throw new Error("Banco de horas de produção exige parâmetros oficiais aprovados.");
    const creditLimit = new Prisma.Decimal(policy.maxCreditPerDayHours); const debitLimit = new Prisma.Decimal(policy.maxDebitPerDayHours);
    if (creditLimit.gt(24) || debitLimit.gt(24)) throw new Error("Limites diários de banco de horas não podem ultrapassar 24h.");
    const records = await tx.attendanceRecord.findMany({ where: { employeeId: contract.employeeId, date: { gte: period.start, lte: period.end }, bankHours: { not: 0 } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    const ids: string[] = [];
    const pending: { record: AttendanceRecord; quantity: Prisma.Decimal; sourceKey: string }[] = [];
    for (const record of records) {
      await tx.$queryRaw`SELECT id FROM "AttendanceRecord" WHERE id=${record.id} FOR UPDATE`;
      const current = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
      const quantity = new Prisma.Decimal(String(current.bankHours));
      if (!quantity.isFinite() || !quantity.eq(quantity.toDecimalPlaces(4)) || quantity.gt(creditLimit) || quantity.negated().gt(debitLimit) || !policy.allowedStatuses.includes(current.status) || current.employeeId !== contract.employeeId || current.date < contract.admittedAt || (contract.endsAt && current.date > contract.endsAt)) throw new Error("Horas/situação/período do ponto incompatíveis com a política do banco.");
      if (quantity.gt(0) && policy.forbidPaidOvertimeForCredit && current.extraHours > 0) throw new Error("Política impede crédito de banco em registro com horas extras remuneradas.");
      const sourceKey = await attendancePostingKey(tx, `PONTO:BANCO_HORAS:${current.id}`, current);
      await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "BANCO_HORAS_RECONHECIDO", payload: { contractId: contract.id, contractVersion: contract.version, competence: input.competence, ruleId: rule.id, policy, attendance: current, quantity: quantity.toString() } });
      const existing = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
      if (existing) { ids.push(existing.id); continue; }
      pending.push({ record: current, quantity, sourceKey });
    }
    const ledger = await tx.hrRightEntry.findMany({ where: { contractId: contract.id, kind: "BANCO_HORAS", details: { path: ["scope"], equals: rule.ruleSet.scope } }, select: { periodStart: true, quantity: true } });
    const balances = [...ledger.map(entry => ({ date: entry.periodStart, quantity: entry.quantity })), ...pending.map(entry => ({ date: entry.record.date, quantity: entry.quantity }))];
    if (pending.length) {
      validateTimeBankBalances(balances, policy.maxBalanceHours, rule.ruleSet.effectiveFrom);
      for (const day of new Set(pending.map(entry => entry.record.date.toISOString().slice(0, 10)))) {
        const daily = balances.filter(entry => entry.date.toISOString().slice(0, 10) === day);
        const credit = daily.reduce((sum, entry) => sum.add(Prisma.Decimal.max(0, entry.quantity)), new Prisma.Decimal(0));
        const debit = daily.reduce((sum, entry) => sum.add(Prisma.Decimal.min(0, entry.quantity)), new Prisma.Decimal(0)).negated();
        if (credit.gt(creditLimit) || debit.gt(debitLimit)) throw new Error(`Somatório diário do banco de horas excede a política em ${day}.`);
      }
    }
    for (const { record: current, quantity, sourceKey } of pending) {
      const entry = await tx.hrRightEntry.create({ data: { contractId: contract.id, sourceKey, kind: "BANCO_HORAS", periodStart: current.date, periodEnd: current.date, quantity, amount: 0, actorId, details: JSON.parse(JSON.stringify({ policy, scope: rule.ruleSet.scope, attendanceId: current.id, contractVersion: contract.version, reason: "Horas reconhecidas no ponto" })) } });
      ids.push(entry.id);
    }
    return { ids: ids.sort(), records: records.length };
  }, { timeout: 60000 });
}

export async function reverseAttendanceTimeBank(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ entryId: z.string().min(1), reason: z.string().trim().min(3).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const original = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: input.entryId } });
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: original.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    if (original.kind !== "BANCO_HORAS" || !original.sourceKey.startsWith("PONTO:BANCO_HORAS:")) throw new Error("Estorno exige entrada original de banco de horas reconhecida no ponto.");
    const details = z.object({ policy: policySchema, scope: z.enum(["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"]), attendanceId: z.string() }).parse(original.details);
    const sourceKey = `ESTORNO:BANCO_HORAS:${original.id}`;
    const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
    if (previous) {
      if ((previous.details as { reason?: string }).reason !== input.reason) throw new Error("Estorno já registrado com fundamento diferente.");
      return previous;
    }
    const ledger = await tx.hrRightEntry.findMany({ where: { contractId: contract.id, kind: "BANCO_HORAS", details: { path: ["scope"], equals: details.scope } }, select: { periodStart: true, quantity: true } });
    const quantity = original.quantity.negated();
    // An adjustment is effective on the original civil day: all subsequent
    // compensations remain valid, without borrowing credit from the future.
    validateTimeBankBalances([...ledger.map(entry => ({ date: entry.periodStart, quantity: entry.quantity })), { date: original.periodStart, quantity }], details.policy.maxBalanceHours, original.periodStart);
    const entry = await tx.hrRightEntry.create({ data: { contractId: contract.id, sourceKey, kind: "BANCO_HORAS", periodStart: original.periodStart, periodEnd: original.periodEnd, quantity, amount: 0, actorId, details: { ...details, originalEntryId: original.id, reason: input.reason } } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: details.scope, eventType: "BANCO_HORAS_ESTORNADO", payload: { originalEntryId: original.id, entryId: entry.id, actorId, reason: input.reason, quantity: quantity.toString() } });
    return entry;
  });
}
