import { and, asc, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { Decimal as DecimalJs } from "decimal.js";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrEmploymentContracts, hrRightEntries } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel } from "@/db/repositories/personnel/integration";
import { listEmploymentContracts, requireEmploymentRegime, requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { validateTimeBankBalances } from "./time-bank";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";

export const timeBankExpirationPolicySchema = z.object({ origin: z.literal("BANCO_HORAS_EXPIRACAO"), method: z.literal("FIFO_PRESERVA_ORIGEM"), effectiveMode: z.literal("BAIXA_EXPLICITA_NA_APURACAO"), maximumAgeDays: z.number().int().min(1).max(36500), legalReference: z.string().trim().min(3) }).strict();
type Entry = { id: string; contractId: string; periodStart: Date; quantity: DecimalJs.Value; details: unknown };
type Lot = { originId: string; acquiredAt: Date; contractId: string; hours: Decimal };
const memory = (entry: Entry) => entry.details as { originalEntryId?: string; operation?: string; transferSourceKey?: string; direction?: string; otherContractId?: string };

/** Replays the whole holder's ledger. Transfers carry original acquisition
 * dates; moving the same hours through another contract never rejuvenates them. */
export function calculateTimeBankLots(entries: Entry[], through: Date) {
  const originals = new Map(entries.map(row => [row.id, row]));
  const reversals = entries.filter(row => memory(row).originalEntryId && row.periodStart <= through);
  const cancelled = new Set<string>();
  for (const reversal of reversals) {
    const original = originals.get(memory(reversal).originalEntryId!);
    if (!original || original.contractId !== reversal.contractId || original.periodStart.getTime() !== reversal.periodStart.getTime() || !new Decimal(original.quantity).add(reversal.quantity).isZero() || cancelled.has(original.id)) throw new Error("Compensação de banco incompatível com a origem do lote.");
    cancelled.add(original.id); cancelled.add(reversal.id);
  }
  const active = entries.filter(row => row.periodStart <= through && !cancelled.has(row.id));
  const transfers = new Map<string, Entry[]>();
  for (const entry of active.filter(row => memory(row).operation === "TRANSFERENCIA")) {
    const key = memory(entry).transferSourceKey;
    if (!key) throw new Error("Transferência sem origem íntegra para lote.");
    transfers.set(key, [...(transfers.get(key) || []), entry]);
  }
  const lots: Lot[] = [];
  const take = (contractId: string, requested: Decimal, targetId?: string) => {
    let remaining = requested;
    for (const lot of lots.filter(row => row.contractId === contractId && row.hours.gt(0)).sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime() || a.originId.localeCompare(b.originId))) {
      const used = Decimal.min(remaining, lot.hours); lot.hours = lot.hours.sub(used); remaining = remaining.sub(used);
      if (targetId && used.gt(0)) lots.push({ originId: lot.originId, acquiredAt: lot.acquiredAt, contractId: targetId, hours: used });
      if (remaining.isZero()) break;
    }
    if (remaining.gt(0)) throw new Error("Débito não possui lotes anteriores suficientes; concilie o banco de horas.");
  };
  for (const date of [...new Set(active.map(row => row.periodStart.toISOString().slice(0, 10)))].sort()) {
    const daily = active.filter(row => row.periodStart.toISOString().slice(0, 10) === date);
    // The established balance engine nets a civil day; recognize its ordinary
    // credits before debits. Transfers retain persisted operation order.
    for (const entry of daily.filter(row => memory(row).operation !== "TRANSFERENCIA" && new Decimal(row.quantity).gt(0))) lots.push({ originId: entry.id, acquiredAt: entry.periodStart, contractId: entry.contractId, hours: new Decimal(entry.quantity) });
    const handled = new Set<string>();
    const pending = daily.filter(row => memory(row).operation === "TRANSFERENCIA");
    while (pending.length) {
      let advanced = false;
      for (let index = 0; index < pending.length; index++) {
        const row = pending[index]; const key = memory(row).transferSourceKey!;
        if (handled.has(key)) { pending.splice(index--, 1); continue; }
        const pair = transfers.get(key)!;
        const outgoing = pair.find(entry => new Decimal(entry.quantity).lt(0)); const incoming = pair.find(entry => new Decimal(entry.quantity).gt(0));
        if (pair.length !== 2 || !outgoing || !incoming || outgoing.periodStart.getTime() !== incoming.periodStart.getTime() || !new Decimal(outgoing.quantity).add(incoming.quantity).isZero() || memory(outgoing).otherContractId !== incoming.contractId || memory(incoming).otherContractId !== outgoing.contractId) throw new Error("Pernas de transferência inconsistentes para atribuição de lotes.");
        const quantity = new Decimal(incoming.quantity);
        if (lots.filter(lot => lot.contractId === outgoing.contractId).reduce((sum, lot) => sum.add(lot.hours), new Decimal(0)).lt(quantity)) continue;
        take(outgoing.contractId, quantity, incoming.contractId); handled.add(key); pending.splice(index--, 1); advanced = true;
      }
      if (pending.length && !advanced && !pending.every(row => handled.has(memory(row).transferSourceKey!))) throw new Error("Transferências circulares ou sem saldo de origem para atribuição FIFO.");
    }
    for (const entry of daily.filter(row => memory(row).operation !== "TRANSFERENCIA" && new Decimal(row.quantity).lt(0))) take(entry.contractId, new Decimal(entry.quantity).negated());
  }
  return lots.filter(lot => lot.hours.gt(0));
}

export async function expireTimeBankLots(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ employeeId: z.string().min(1), ruleId: z.string().min(1), through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mode: z.enum(["PREVIA", "APLICAR"]) }).strict().parse(raw);
  const through = new Date(`${input.through}T00:00:00.000Z`);
  if (!Number.isFinite(through.getTime()) || through.toISOString().slice(0, 10) !== input.through || through > new Date()) throw new Error("Data de expiração inválida ou futura.");
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `employee:${input.employeeId}`);
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = timeBankExpirationPolicySchema.parse(rule.value); const set = rule.ruleSet;
    const sourceKey = `BANCO_HORAS:EXPIRACAO:${input.employeeId}:${set.scope}:${input.through}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const evidence = previous.payload as { ruleId: string; rows: { contractId: string; hours: string; origins: string[] }[]; entryIds: string[] };
      if (evidence.ruleId !== input.ruleId) throw new Error("Data já apurada com outra política de expiração.");
      return { rows: evidence.rows, entryIds: evidence.entryIds, applied: true };
    }
    if (!rule.isActive || set.status !== "ATIVA" || set.effectiveFrom > through || (set.effectiveUntil && set.effectiveUntil < through)) throw new Error("Política de expiração fora da vigência ativa.");
    if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Expiração de produção exige parâmetros oficiais aprovados.");
    const contracts = await listEmploymentContracts(tx, eq(hrEmploymentContracts.employeeId, input.employeeId));
    for (const contract of contracts) await lockPersonnel(tx, `contract:${contract.id}`);
    const ledgerRows = await tx.select({ entry: hrRightEntries }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).where(and(eq(hrEmploymentContracts.employeeId, input.employeeId), eq(hrRightEntries.kind, "BANCO_HORAS"), sql`${hrRightEntries.details}->>'scope' = ${set.scope}`)).orderBy(asc(hrRightEntries.createdAt), asc(hrRightEntries.id));
    const ledger = ledgerRows.map(row => row.entry);
    const lots = calculateTimeBankLots(ledger, through);
    const expired = lots.filter(lot => through.getTime() >= lot.acquiredAt.getTime() + policy.maximumAgeDays * 86400000);
    const rows = [];
    for (const stored of contracts) {
      const selected = expired.filter(lot => lot.contractId === stored.id);
      if (!selected.length) continue;
      const contract = resolveContractRevision(stored, stored.revisions, { start: through, end: through }).contract;
      const regime = await requireEmploymentRegime(tx, contract.regimeId);
      if (regime.ruleSetId !== set.id) throw new Error("Política de expiração deve abranger todos os regimes dos lotes atingidos.");
      const hours = selected.reduce((sum, lot) => sum.add(lot.hours), new Decimal(0));
      validateTimeBankBalances([...ledger.filter(row => row.contractId === stored.id).map(row => ({ date: row.periodStart, quantity: row.quantity })), { date: through, quantity: hours.negated() }], "999999999999", through);
      rows.push({ contractId: stored.id, hours: hours.toString(), origins: [...new Set(selected.map(lot => lot.originId))] });
    }
    const entryIds = [];
    if (input.mode === "APLICAR") {
      for (const row of rows) {
        const [entry] = await tx.insert(hrRightEntries).values({ contractId: row.contractId, sourceKey: `${sourceKey}:${row.contractId}`, kind: "BANCO_HORAS", periodStart: through, periodEnd: through, quantity: new Decimal(row.hours).negated(), amount: new Decimal(0), actorId, details: { scope: set.scope, operation: "EXPIRACAO", origins: row.origins, ruleId: rule.id, policy, reason: policy.legalReference } }).returning();
        entryIds.push(entry.id);
      }
      await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: set.scope, eventType: "BANCO_HORAS_EXPIRADO", payload: { ruleId: rule.id, rows, entryIds, actorId, through: input.through, policy } });
    }
    return { rows, entryIds, applied: input.mode === "APLICAR" };
  }, { timeoutMs: 60000 });
}
