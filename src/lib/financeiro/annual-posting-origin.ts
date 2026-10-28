import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { findAccountingEntryWithTransaction, findAccountingTransaction, findAnnualEditionAudit, listAccountingEntries, listAnnualClearanceEntries } from "@/db/repositories/finance/accounting";
import { findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";
import { z } from "zod";

export const annualLineSchema = z.object({ accountId: z.string(), type: z.enum(["Débito", "Crédito"]), value: z.string(), annualBalanceOriginEntryId: z.string() });
export const annualEditionSchema = z.object({ stage: z.enum(["OPENING", "RESULT_CLOSE", "BUDGET_CLOSE", "RAP_REGISTRATION"]), sourceFinancialYearId: z.string(), targetFinancialYearId: z.string(), governmentEntityId: z.string(), date: z.string(), groups: z.array(z.object({ budgetUnitId: z.string(), lines: z.array(annualLineSchema) })) });
type Input = { financialYearId: string; governmentEntityId?: string; budgetUnitId?: string; date: Date; sourceModule?: string; sourceType?: string; sourceId?: string; eventType?: string; lines: { accountId: string; type: "Débito" | "Crédito"; value: Decimal | string | number; annualBalanceOriginEntryId?: string }[] };
const object = (value: JsonValue | undefined): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value : null;

/** Only an immutable, scoped annual edition may supply inherited classification and IC. */
export async function resolveAnnualPostingOrigins(tx: DatabaseExecutor, input: Input) {
  if (!input.lines.some(line => line.annualBalanceOriginEntryId)) return null;
  if (input.sourceModule !== "FINANCEIRO" || input.sourceType !== "ANNUAL_BALANCE" || !input.sourceId || input.lines.some(line => !line.annualBalanceOriginEntryId)) throw new Error("Origem de saldo anual exige edição documental completa.");
  const audit = await findAnnualEditionAudit(tx, input.sourceId);
  if (!audit) throw new Error("Edição anual não encontrada.");
  if (audit.action !== "ANNUAL_BALANCE_EDITION" || audit.entityType !== "AnnualBalanceEdition" || audit.financialYearId !== input.financialYearId) throw new Error("Edição anual fora do exercício informado.");
  const edition = annualEditionSchema.parse(audit.payload);
  if (edition.targetFinancialYearId !== input.financialYearId || edition.governmentEntityId !== input.governmentEntityId || edition.date !== input.date.toISOString() || input.eventType !== `ANNUAL_${edition.stage}`) throw new Error("Lançamento diverge da edição anual documentada.");
  const group = edition.groups.find(group => group.budgetUnitId === input.budgetUnitId);
  const key = (line: Input["lines"][number]) => JSON.stringify([line.accountId, line.type, new Decimal(line.value).toFixed(2), line.annualBalanceOriginEntryId]);
  if (!group || JSON.stringify(group.lines.map(key).sort()) !== JSON.stringify(input.lines.map(key).sort())) throw new Error("Partidas anuais divergem da composição documentada da UG.");
  const [source, target] = await Promise.all([findFinancialScopeYear(tx, edition.sourceFinancialYearId), findFinancialScopeYear(tx, edition.targetFinancialYearId)]);
  if (!source || !target) throw new Error("Exercício da edição anual não encontrado.");
  if (source.governmentEntityId !== edition.governmentEntityId || target.governmentEntityId !== edition.governmentEntityId || edition.stage === "OPENING" && target.year !== source.year + 1 || edition.stage !== "OPENING" && source.id !== target.id) throw new Error("Origem e destino anual fora do ente ou sequência de exercícios.");
  const memories = [];
  for (const line of input.lines) {
    const entry = await findAccountingEntryWithTransaction(tx, line.annualBalanceOriginEntryId!);
    if (!entry) throw new Error("Linha de origem anual não encontrada.");
    if (!entry.transaction || entry.transaction.status !== "POSTADO" || entry.transaction.financialYearId !== source.id || entry.transaction.governmentEntityId !== edition.governmentEntityId || entry.transaction.budgetUnitId !== group.budgetUnitId) throw new Error("Saldo anual sem partida original do exercício e UG documentados.");
    const snapshot = object(entry.classificationSnapshot ?? undefined);
    const dimensions = object(snapshot?.dimensions);
    const carriedDimensions: JsonObject | null = dimensions ? { ...dimensions, annualOriginEntryId: entry.id, annualOriginYearId: source.id } : null;
    if (carriedDimensions && entry.accountId !== line.accountId) delete carriedDimensions.msc;
    memories.push({ classification: entry.accountId === line.accountId ? snapshot : null, dimensions: carriedDimensions });
  }
  return { edition, memories };
}

export async function isAnnualResultReversal(tx: DatabaseExecutor, input: { financialYearId: string; governmentEntityId?: string; budgetUnitId?: string; date: Date; sourceModule?: string; sourceType?: string; sourceId?: string; eventType?: string; reversalOfId?: string; lines: { accountId: string; type: string; value: Decimal | string | number; originalEntryId?: string }[] }) {
  if (!["ANNUAL_RESULT_CLOSE_UNDONE", "ANNUAL_BUDGET_CLOSE_UNDONE", "ANNUAL_RAP_REGISTRATION_UNDONE"].includes(input.eventType ?? "")) return false;
  if (input.sourceModule !== "FINANCEIRO" || input.sourceType !== "ANNUAL_BALANCE_REVERSAL" || !input.reversalOfId || !input.sourceId) throw new Error("Desmovimentação anual sem origem documental.");
  const original = await findAccountingTransaction(tx, input.reversalOfId);
  const audit = await findAnnualEditionAudit(tx, input.sourceId);
  if (!original || !audit) throw new Error("Desmovimentação anual sem origem documental.");
  const entries = await listAccountingEntries(tx, original.id);
  const edition = annualEditionSchema.parse(audit.payload);
  if (audit.action !== "ANNUAL_BALANCE_EDITION" || audit.entityType !== "AnnualBalanceEdition" || !["RESULT_CLOSE", "BUDGET_CLOSE", "RAP_REGISTRATION"].includes(edition.stage) || input.eventType !== `ANNUAL_${edition.stage}_UNDONE` || edition.targetFinancialYearId !== input.financialYearId || original.financialYearId !== input.financialYearId || original.governmentEntityId !== input.governmentEntityId || original.budgetUnitId !== input.budgetUnitId || original.sourceId !== audit.id || original.sourceType !== "ANNUAL_BALANCE" || original.eventType !== `ANNUAL_${edition.stage}` || original.date.getTime() !== input.date.getTime()) throw new Error("Desmovimentação diverge do encerramento documentado.");
  const expected = entries.map(entry => JSON.stringify([entry.id, entry.accountId, entry.type === "Débito" ? "Crédito" : "Débito", entry.valueDecimal?.toFixed(2)])).sort();
  const requested = input.lines.map(line => JSON.stringify([line.originalEntryId, line.accountId, line.type, new Decimal(line.value).toFixed(2)])).sort();
  if (JSON.stringify(expected) !== JSON.stringify(requested)) throw new Error("Desmovimentação exige inversão integral da edição anual.");
  return true;
}

export async function assertAnnualResultCleared(tx: DatabaseExecutor, financialYearId: string) {
  const entries = await listAnnualClearanceEntries(tx, financialYearId);
  const balances = new Map<string, Decimal>();
  for (const entry of entries) {
    const snapshot = object(entry.classificationSnapshot ?? undefined);
    const code = typeof snapshot?.externalCode === "string" ? snapshot.externalCode.replace(/\D/g, "").slice(0, 1) : "";
    if (!["3", "4"].includes(code) && !["VPD", "VPA"].includes(entry.account.type)) continue;
    if (!entry.valueDecimal || !["Débito", "Crédito"].includes(entry.type)) throw new Error("Apuração do resultado exige partidas Decimal conciliadas.");
    const dimensions = object(snapshot?.dimensions);
    const key = JSON.stringify([entry.transaction?.budgetUnitId, entry.accountId, dimensions?.resourceSourceId ?? null, dimensions?.budgetDimensions ?? null]);
    const balance = balances.get(key) ?? new Decimal(0);
    balances.set(key, entry.type === "Débito" ? balance.plus(entry.valueDecimal) : balance.minus(entry.valueDecimal));
  }
  if ([...balances.values()].some(balance => !balance.isZero())) throw new Error("Execute a apuração anual: existem saldos de VPD/VPA não encerrados por UG e fonte.");
}

export async function assertAnnualBudgetCleared(tx: DatabaseExecutor, financialYearId: string) {
  const entries = await listAnnualClearanceEntries(tx, financialYearId);
  const balances = new Map<string, Decimal>();
  for (const entry of entries) {
    const snapshot = object(entry.classificationSnapshot ?? undefined);
    const code = typeof snapshot?.externalCode === "string" ? snapshot.externalCode.replace(/\D/g, "").slice(0, 1) : "";
    if (!["5", "6"].includes(code)) continue;
    if (!entry.valueDecimal?.isFinite() || entry.valueDecimal.lte(0) || !["Débito", "Crédito"].includes(entry.type)) throw new Error("Encerramento orçamentário exige partidas Decimal e direção conciliadas.");
    const dimensions = object(snapshot?.dimensions);
    const key = JSON.stringify([entry.transaction?.budgetUnitId, entry.accountId, dimensions?.resourceSourceId ?? null, dimensions?.sourceClassification ?? null, dimensions?.budgetDimensions ?? null, dimensions?.msc ?? null]);
    const balance = balances.get(key) ?? new Decimal(0);
    balances.set(key, entry.type === "Débito" ? balance.plus(entry.valueDecimal) : balance.minus(entry.valueDecimal));
  }
  if ([...balances.values()].some(balance => !balance.isZero())) throw new Error("Execute o encerramento orçamentário: existem saldos das classes 5/6 não encerrados por UG, fonte e informações complementares.");
}
