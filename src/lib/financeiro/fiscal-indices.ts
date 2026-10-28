import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { type DatabaseExecutor, withDatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import type { FiscalAccountingTransaction } from "@/lib/contracts/finance-fiscal-indices";
import { findFiscalOriginFunction, hasFiscalAccountChildren, insertFiscalDefinition, listFiscalAccounts, listFiscalCloses, listFiscalEntries, listFiscalOriginalTransactions, readFiscalDefinition, readFiscalEntityType } from "@/db/repositories/finance/fiscal-indices";
import { z } from "zod";
import { resolveFinancialReportScope } from "./report-scope";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

export const fiscalIndexCodes = ["HEALTH_MINIMUM", "EDUCATION_MINIMUM"] as const;
export type FiscalIndexCode = typeof fiscalIndexCodes[number];
type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
export class FiscalIndexError extends Error {}
const ids = z.array(z.string().trim().min(1)).min(1).max(500).refine(values => new Set(values).size === values.length, "Referências repetidas.");
export const fiscalIndexTermSchema = z.object({ label: z.string().trim().min(1).max(300), accountIds: ids, side: z.enum(["DEBIT_NET", "CREDIT_NET"]), operation: z.enum(["ADD", "SUBTRACT"]), sourceTypes: ids.optional(), budgetUnitIds: ids.optional(), functionCodes: z.array(z.string().regex(/^\d{2}$/)).min(1).optional() }).strict();
export const fiscalIndexDefinitionSchema = z.object({ numerator: z.array(fiscalIndexTermSchema).min(1).max(100), denominator: z.array(fiscalIndexTermSchema).min(1).max(100) }).strict();
export type FiscalIndexDefinition = z.infer<typeof fiscalIndexDefinitionSchema>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function scopeFor(tx: DatabaseExecutor, actor: Actor, financialYearId: string) {
  const scope = await resolveFinancialReportScope(tx, financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
  if (!scope.governmentEntityId || !scope.fullEntity || !scope.budgetUnitIds?.length) throw new FiscalIndexError("Índice constitucional exige exercício do ente e autorização de todas as suas UGs.");
  return scope;
}

export async function defineMunicipalFiscalIndex(db: DatabaseConnection, actor: Actor, input: { financialYearId: string; code: FiscalIndexCode; legalReference: string; minimumPercentage: string; effectiveFrom: Date; reason: string; definition: FiscalIndexDefinition }) {
  const definition = fiscalIndexDefinitionSchema.parse(input.definition);
  const minimum = new Decimal(input.minimumPercentage);
  if (!fiscalIndexCodes.includes(input.code) || !input.legalReference?.trim() || !input.reason?.trim() || !Number.isFinite(input.effectiveFrom.getTime()) || !minimum.isFinite() || minimum.lte(0) || minimum.gt(100) || minimum.decimalPlaces() > 4) throw new FiscalIndexError("Informe fundamento, vigência, justificativa e percentual mínimo válido.");
  return withDatabaseTransaction(db, async tx => {
    const scope = await scopeFor(tx, actor, input.financialYearId);
    if (await readFiscalEntityType(tx, scope.governmentEntityId!) !== "PREFEITURA") throw new FiscalIndexError("Mínimos municipais de Saúde/Educação exigem composição do ente executivo; não aplicar à Câmara isoladamente.");
    if (input.effectiveFrom.getUTCFullYear() !== scope.year) throw new FiscalIndexError("Vigência da composição fiscal deve pertencer ao exercício.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_INDEX:${input.financialYearId}:${input.code}`}, 0))::text`);
    for (const term of [...definition.numerator, ...definition.denominator]) {
      if (term.budgetUnitIds?.some(id => !scope.budgetUnitIds!.includes(id))) throw new FiscalIndexError("Componente fiscal contém UG de outro ente.");
      const accounts = await listFiscalAccounts(tx, term.accountIds);
      if (accounts.length !== term.accountIds.length) throw new FiscalIndexError("Componente fiscal contém conta contábil inexistente.");
      if (await hasFiscalAccountChildren(tx, accounts.map(account => account.code))) throw new FiscalIndexError("A composição fiscal exige contas analíticas, sem contas-filhas.");
    }
    const record = await insertFiscalDefinition(tx, { financialYearId: input.financialYearId, code: input.code, legalReference: input.legalReference.trim(), minimumPercentage: minimum, effectiveFrom: input.effectiveFrom, reason: input.reason.trim(), actorId: actor.usuarioId, definition: json(definition) });
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_FISCAL_INDEX_DEFINITION", targetId: record.id });
    return record;
  });
}

/** Same dated Decimal accounting facts for diagnostics, index monitoring and reports. */
export async function readMunicipalFiscalIndex(tx: DatabaseExecutor, actor: Actor, input: { financialYearId: string; code: FiscalIndexCode; through: Date }) {
  const scope = await scopeFor(tx, actor, input.financialYearId);
  if (!Number.isFinite(input.through.getTime()) || input.through.getUTCFullYear() !== scope.year || input.through > new Date()) throw new FiscalIndexError("Corte fiscal inválido ou futuro.");
  const definition = await readFiscalDefinition(tx, input.financialYearId, input.code, input.through);
  const base = { code: input.code, financialYearId: input.financialYearId, governmentEntityId: scope.governmentEntityId, through: input.through.toISOString(), definitionId: definition?.id ?? null };
  if (await readFiscalEntityType(tx, scope.governmentEntityId!) !== "PREFEITURA") return { ...base, status: "NOT_EVALUATED" as const, issues: ["Mínimos municipais de Saúde/Educação não são aplicáveis à Câmara isoladamente; consultar o ente executivo."], numerator: null, denominator: null, percentage: null, minimum: null, rows: [], sourceHash: null };
  if (!definition) return { ...base, status: "NOT_EVALUATED" as const, issues: ["Composição/fundamento fiscal não configurados."], numerator: null, denominator: null, percentage: null, minimum: null, rows: [], sourceHash: null };
  const config = fiscalIndexDefinitionSchema.parse(definition.definition);
  const start = new Date(Date.UTC(scope.year, 0, 1));
  const closes = await listFiscalCloses(tx, input.financialYearId, start, input.through);
  const issues: string[] = [];
  const finalDay = new Date(Date.UTC(scope.year, input.through.getUTCMonth() + 1, 0)).getUTCDate();
  if (input.through.getUTCDate() !== finalDay || input.through.getUTCHours() !== 23 || input.through.getUTCMinutes() !== 59 || input.through.getUTCSeconds() !== 59 || input.through.getUTCMilliseconds() !== 999) issues.push("Corte fiscal não encerra uma competência mensal completa.");
  for (let month = 0; month <= input.through.getUTCMonth(); month++) if (!closes.some(close => close.competence.getUTCMonth() === month)) issues.push(`Competência ${scope.year}-${String(month + 1).padStart(2, "0")} sem fechamento confirmado.`);
  const terms = [...config.numerator, ...config.denominator];
  const entries = await listFiscalEntries(tx, { accountIds: [...new Set(terms.flatMap(term => term.accountIds))], financialYearId: input.financialYearId, governmentEntityId: scope.governmentEntityId!, budgetUnitIds: scope.budgetUnitIds!, from: start, through: input.through });
  const reversalIds = [...new Set(entries.flatMap(entry => entry.transaction?.reversalOfId ? [entry.transaction.reversalOfId] : []))];
  const originals = new Map<string, FiscalAccountingTransaction>();
  for (let offset = 0; offset < reversalIds.length; offset += 500) for (const transaction of await listFiscalOriginalTransactions(tx, reversalIds.slice(offset, offset + 500))) originals.set(transaction.id, transaction);
  const originFor = (transaction: NonNullable<typeof entries[number]["transaction"]>) => transaction.reversalOfId ? originals.get(transaction.reversalOfId) ?? transaction : transaction;
  const functionByTransaction = new Map<string, string | null>();
  if (terms.some(term => term.functionCodes?.length)) for (const transaction of new Map(entries.map(entry => [entry.transactionId!, entry.transaction!])).values()) {
    const source = originFor(transaction);
    const appropriation = source.sourceId ? await findFiscalOriginFunction(tx, source.sourceType, source.sourceId) : null;
    functionByTransaction.set(transaction.id, appropriation?.financialYearId === input.financialYearId && scope.budgetUnitIds!.includes(appropriation.budgetUnitId) ? appropriation.functionCode : null);
  }
  const rows: Array<{ section: string; label: string; value: string; entryIds: string[] }> = [];
  async function total(section: string, selection: z.infer<typeof fiscalIndexTermSchema>[]) {
    const used = new Set<string>(); let sum = new Decimal(0);
    for (const term of selection) {
      let value = new Decimal(0); const entryIds: string[] = [];
      for (const entry of entries) {
        const transaction = entry.transaction!;
        const origin = originFor(transaction);
        if (transaction.reversalOfId && !originals.has(transaction.reversalOfId)) { issues.push(`Estorno ${transaction.id} sem partida original conciliada.`); continue; }
        if (!term.accountIds.includes(entry.accountId) || (term.budgetUnitIds && !term.budgetUnitIds.includes(transaction.budgetUnitId!)) || (term.sourceTypes && !term.sourceTypes.includes(origin.sourceType))) continue;
        if (term.functionCodes) {
          const code = functionByTransaction.get(transaction.id);
          if (!code) { issues.push(`Partida ${transaction.id} sem função canônica conciliada.`); continue; }
          if (!term.functionCodes.includes(code)) continue;
        }
        if (used.has(entry.id)) { issues.push(`Linha ${entry.id} selecionada em mais de um componente de ${section}.`); continue; }
        used.add(entry.id);
        if (!entry.valueDecimal || !["Débito", "Crédito"].includes(entry.type)) { issues.push(`Linha ${entry.id} sem valor Decimal/sinal conciliado.`); continue; }
        const sign = (entry.type === "Débito") === (term.side === "DEBIT_NET") ? 1 : -1;
        value = value.plus(entry.valueDecimal.mul(sign).mul(term.operation === "ADD" ? 1 : -1)); entryIds.push(entry.id);
      }
      rows.push({ section, label: term.label, value: value.toFixed(2), entryIds }); sum = sum.plus(value);
    }
    return sum;
  }
  const numerator = await total("NUMERATOR", config.numerator), denominator = await total("DENOMINATOR", config.denominator);
  if (denominator.lte(0)) issues.push("Base de cálculo inexistente ou não positiva.");
  if (numerator.lt(0)) issues.push("Aplicação líquida negativa exige conciliação fiscal.");
  const percentage = denominator.gt(0) ? numerator.mul(100).div(denominator) : null;
  return { ...base, status: issues.length ? "NOT_EVALUATED" as const : percentage!.lt(definition.minimumPercentage) ? "IRREGULAR" as const : "REGULAR" as const, issues: [...new Set(issues)], numerator: numerator.toFixed(2), denominator: denominator.toFixed(2), percentage: issues.length ? null : percentage!.toFixed(4), minimum: definition.minimumPercentage.toFixed(4), legalReference: definition.legalReference, revision: definition.revision, rows, sourceHash: hash({ definitionId: definition.id, rows, closes: closes.map(close => ({ id: close.id, month: close.competence.toISOString() })), entries: entries.map(entry => ({ id: entry.id, amount: entry.valueDecimal?.toFixed(2), type: entry.type, transactionId: entry.transactionId })) }) };
}
