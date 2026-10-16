import { Prisma } from "@prisma/client";
import { z } from "zod";

export const annualLineSchema = z.object({ accountId: z.string(), type: z.enum(["Débito", "Crédito"]), value: z.string(), annualBalanceOriginEntryId: z.string() });
export const annualEditionSchema = z.object({ stage: z.enum(["OPENING", "RESULT_CLOSE", "BUDGET_CLOSE", "RAP_REGISTRATION"]), sourceFinancialYearId: z.string(), targetFinancialYearId: z.string(), governmentEntityId: z.string(), date: z.string(), groups: z.array(z.object({ budgetUnitId: z.string(), lines: z.array(annualLineSchema) })) });
type Input = { financialYearId: string; governmentEntityId?: string; budgetUnitId?: string; date: Date; sourceModule?: string; sourceType?: string; sourceId?: string; eventType?: string; lines: { accountId: string; type: "Débito" | "Crédito"; value: Prisma.Decimal | string | number; annualBalanceOriginEntryId?: string }[] };
const object = (value: Prisma.JsonValue | undefined): Prisma.InputJsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.InputJsonObject : null;

/** Only an immutable, scoped annual edition may supply inherited classification and IC. */
export async function resolveAnnualPostingOrigins(tx: Prisma.TransactionClient, input: Input) {
  if (!input.lines.some(line => line.annualBalanceOriginEntryId)) return null;
  if (input.sourceModule !== "FINANCEIRO" || input.sourceType !== "ANNUAL_BALANCE" || !input.sourceId || input.lines.some(line => !line.annualBalanceOriginEntryId)) throw new Error("Origem de saldo anual exige edição documental completa.");
  const audit = await tx.financialAuditLog.findUniqueOrThrow({ where: { id: input.sourceId } });
  if (audit.action !== "ANNUAL_BALANCE_EDITION" || audit.entityType !== "AnnualBalanceEdition" || audit.financialYearId !== input.financialYearId) throw new Error("Edição anual fora do exercício informado.");
  const edition = annualEditionSchema.parse(audit.payload);
  if (edition.targetFinancialYearId !== input.financialYearId || edition.governmentEntityId !== input.governmentEntityId || edition.date !== input.date.toISOString() || input.eventType !== `ANNUAL_${edition.stage}`) throw new Error("Lançamento diverge da edição anual documentada.");
  const group = edition.groups.find(group => group.budgetUnitId === input.budgetUnitId);
  const key = (line: Input["lines"][number]) => JSON.stringify([line.accountId, line.type, new Prisma.Decimal(line.value).toFixed(2), line.annualBalanceOriginEntryId]);
  if (!group || JSON.stringify(group.lines.map(key).sort()) !== JSON.stringify(input.lines.map(key).sort())) throw new Error("Partidas anuais divergem da composição documentada da UG.");
  const [source, target] = await Promise.all([tx.financialYear.findUniqueOrThrow({ where: { id: edition.sourceFinancialYearId } }), tx.financialYear.findUniqueOrThrow({ where: { id: edition.targetFinancialYearId } })]);
  if (source.governmentEntityId !== edition.governmentEntityId || target.governmentEntityId !== edition.governmentEntityId || edition.stage === "OPENING" && target.year !== source.year + 1 || edition.stage !== "OPENING" && source.id !== target.id) throw new Error("Origem e destino anual fora do ente ou sequência de exercícios.");
  const memories = [];
  for (const line of input.lines) {
    const entry = await tx.accountingEntry.findUniqueOrThrow({ where: { id: line.annualBalanceOriginEntryId! }, include: { transaction: true } });
    if (!entry.transaction || entry.transaction.status !== "POSTADO" || entry.transaction.financialYearId !== source.id || entry.transaction.governmentEntityId !== edition.governmentEntityId || entry.transaction.budgetUnitId !== group.budgetUnitId) throw new Error("Saldo anual sem partida original do exercício e UG documentados.");
    const snapshot = object(entry.classificationSnapshot ?? undefined);
    const dimensions = object(snapshot?.dimensions as Prisma.JsonValue | undefined);
    const carriedDimensions: Record<string, Prisma.InputJsonValue | null | undefined> | null = dimensions ? { ...dimensions, annualOriginEntryId: entry.id, annualOriginYearId: source.id } : null;
    if (carriedDimensions && entry.accountId !== line.accountId) delete carriedDimensions.msc;
    memories.push({ classification: entry.accountId === line.accountId ? snapshot : null, dimensions: carriedDimensions });
  }
  return { edition, memories };
}

export async function isAnnualResultReversal(tx: Prisma.TransactionClient, input: { financialYearId: string; governmentEntityId?: string; budgetUnitId?: string; date: Date; sourceModule?: string; sourceType?: string; sourceId?: string; eventType?: string; reversalOfId?: string; lines: { accountId: string; type: string; value: Prisma.Decimal | string | number; originalEntryId?: string }[] }) {
  if (!["ANNUAL_RESULT_CLOSE_UNDONE", "ANNUAL_BUDGET_CLOSE_UNDONE", "ANNUAL_RAP_REGISTRATION_UNDONE"].includes(input.eventType ?? "")) return false;
  if (input.sourceModule !== "FINANCEIRO" || input.sourceType !== "ANNUAL_BALANCE_REVERSAL" || !input.reversalOfId || !input.sourceId) throw new Error("Desmovimentação anual sem origem documental.");
  const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: input.reversalOfId }, include: { entries: true } });
  const audit = await tx.financialAuditLog.findUniqueOrThrow({ where: { id: input.sourceId } });
  const edition = annualEditionSchema.parse(audit.payload);
  if (audit.action !== "ANNUAL_BALANCE_EDITION" || audit.entityType !== "AnnualBalanceEdition" || !["RESULT_CLOSE", "BUDGET_CLOSE", "RAP_REGISTRATION"].includes(edition.stage) || input.eventType !== `ANNUAL_${edition.stage}_UNDONE` || edition.targetFinancialYearId !== input.financialYearId || original.financialYearId !== input.financialYearId || original.governmentEntityId !== input.governmentEntityId || original.budgetUnitId !== input.budgetUnitId || original.sourceId !== audit.id || original.sourceType !== "ANNUAL_BALANCE" || original.eventType !== `ANNUAL_${edition.stage}` || original.date.getTime() !== input.date.getTime()) throw new Error("Desmovimentação diverge do encerramento documentado.");
  const expected = original.entries.map(entry => JSON.stringify([entry.id, entry.accountId, entry.type === "Débito" ? "Crédito" : "Débito", entry.valueDecimal?.toFixed(2)])).sort();
  const requested = input.lines.map(line => JSON.stringify([line.originalEntryId, line.accountId, line.type, new Prisma.Decimal(line.value).toFixed(2)])).sort();
  if (JSON.stringify(expected) !== JSON.stringify(requested)) throw new Error("Desmovimentação exige inversão integral da edição anual.");
  return true;
}

export async function assertAnnualResultCleared(tx: Prisma.TransactionClient, financialYearId: string) {
  const entries = await tx.accountingEntry.findMany({ where: { transaction: { financialYearId, status: "POSTADO" } }, include: { account: { select: { type: true } }, transaction: { select: { budgetUnitId: true } } } });
  const balances = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    const snapshot = object(entry.classificationSnapshot ?? undefined);
    const code = typeof snapshot?.externalCode === "string" ? snapshot.externalCode.replace(/\D/g, "").slice(0, 1) : "";
    if (!["3", "4"].includes(code) && !["VPD", "VPA"].includes(entry.account.type)) continue;
    if (!entry.valueDecimal || !["Débito", "Crédito"].includes(entry.type)) throw new Error("Apuração do resultado exige partidas Decimal conciliadas.");
    const dimensions = object(snapshot?.dimensions as Prisma.JsonValue | undefined);
    const key = JSON.stringify([entry.transaction?.budgetUnitId, entry.accountId, dimensions?.resourceSourceId ?? null, dimensions?.budgetDimensions ?? null]);
    const balance = balances.get(key) ?? new Prisma.Decimal(0);
    balances.set(key, entry.type === "Débito" ? balance.plus(entry.valueDecimal) : balance.minus(entry.valueDecimal));
  }
  if ([...balances.values()].some(balance => !balance.isZero())) throw new Error("Execute a apuração anual: existem saldos de VPD/VPA não encerrados por UG e fonte.");
}

export async function assertAnnualBudgetCleared(tx: Prisma.TransactionClient, financialYearId: string) {
  const entries = await tx.accountingEntry.findMany({ where: { transaction: { financialYearId, status: "POSTADO" } }, include: { transaction: { select: { budgetUnitId: true } } } });
  const balances = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    const snapshot = object(entry.classificationSnapshot ?? undefined);
    const code = typeof snapshot?.externalCode === "string" ? snapshot.externalCode.replace(/\D/g, "").slice(0, 1) : "";
    if (!["5", "6"].includes(code)) continue;
    if (!entry.valueDecimal?.isFinite() || entry.valueDecimal.lte(0) || !["Débito", "Crédito"].includes(entry.type)) throw new Error("Encerramento orçamentário exige partidas Decimal e direção conciliadas.");
    const dimensions = object(snapshot?.dimensions as Prisma.JsonValue | undefined);
    const key = JSON.stringify([entry.transaction?.budgetUnitId, entry.accountId, dimensions?.resourceSourceId ?? null, dimensions?.sourceClassification ?? null, dimensions?.budgetDimensions ?? null, dimensions?.msc ?? null]);
    const balance = balances.get(key) ?? new Prisma.Decimal(0);
    balances.set(key, entry.type === "Débito" ? balance.plus(entry.valueDecimal) : balance.minus(entry.valueDecimal));
  }
  if ([...balances.values()].some(balance => !balance.isZero())) throw new Error("Execute o encerramento orçamentário: existem saldos das classes 5/6 não encerrados por UG, fonte e informações complementares.");
}
