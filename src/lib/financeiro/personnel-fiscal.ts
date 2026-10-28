import { createHash } from "node:crypto";
import { Decimal } from "@/db/decimal";
import { sql } from "drizzle-orm";
import type { JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { z } from "zod";
import { fiscalIndexTermSchema } from "./fiscal-indices";
import { resolveFinancialReportScope } from "./report-scope";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { hasFiscalAccountChildren, listFiscalAccounts } from "@/db/repositories/finance/fiscal-indices";
import { insertPersonnelFiscalDefinition, listPersonnelFiscalCloses, listPersonnelFiscalEntries, listPersonnelFiscalYears, readPersonnelFiscalDefinition } from "@/db/repositories/finance/personnel-fiscal";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
export class PersonnelFiscalError extends Error {}
const term = fiscalIndexTermSchema.omit({ functionCodes: true });
export const personnelFiscalComposition = z.object({ personnel: z.array(term).min(1).max(100), adjustedRcl: z.array(term).min(1).max(100) }).strict();
export const personnelFiscalDefinitionInput = z.object({ financialYearId: z.string().min(1), effectiveFrom: z.iso.date(), legalReference: z.string().trim().min(3).max(4000), legalLimit: z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/), prudentialLimit: z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/), alertLimit: z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/), definition: personnelFiscalComposition, reason: z.string().trim().min(10).max(4000) }).strict();
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function definePersonnelFiscalComposition(db: DatabaseConnection, actor: Actor, raw: z.infer<typeof personnelFiscalDefinitionInput>) {
  const input = personnelFiscalDefinitionInput.parse(raw);
  const legalLimit = new Decimal(input.legalLimit), prudentialLimit = new Decimal(input.prudentialLimit), alertLimit = new Decimal(input.alertLimit);
  if (legalLimit.lte(0) || legalLimit.gt(100) || prudentialLimit.lte(0) || prudentialLimit.gt(legalLimit) || alertLimit.lte(0) || alertLimit.gt(prudentialLimit)) throw new PersonnelFiscalError("Limites devem satisfazer 0 < alerta ≤ prudencial ≤ legal ≤ 100.");
  return withDatabaseTransaction(db, async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.fullEntity || !scope.governmentEntityId || !scope.budgetUnitIds?.length) throw new PersonnelFiscalError("Composição de pessoal exige todas as UGs do ente.");
    const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00Z`);
    if (effectiveFrom.getUTCFullYear() !== scope.year) throw new PersonnelFiscalError("Vigência deve pertencer ao exercício selecionado.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`PERSONNEL_FISCAL:${input.financialYearId}`},0))::text`);
    for (const component of [...input.definition.personnel, ...input.definition.adjustedRcl]) {
      if (component.budgetUnitIds?.some(id => !scope.budgetUnitIds!.includes(id))) throw new PersonnelFiscalError("Componente contém UG de outro ente.");
      const accounts = await listFiscalAccounts(tx, component.accountIds);
      if (accounts.length !== component.accountIds.length || await hasFiscalAccountChildren(tx, accounts.map(account => account.code))) throw new PersonnelFiscalError("Composição exige contas contábeis analíticas existentes.");
    }
    const record = await insertPersonnelFiscalDefinition(tx, { financialYearId: input.financialYearId, effectiveFrom, legalReference: input.legalReference, legalLimit, prudentialLimit, alertLimit, definition: json(input.definition), reason: input.reason, actorId: actor.usuarioId });
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_PERSONNEL_FISCAL_DEFINITION", targetId: record.id });
    return record;
  });
}

type PositionInput = { financialYearId: string; through: Date; governmentEntityId?: string; budgetUnitIds?: string[] };
export async function readPersonnelFiscalPosition(db: DatabaseConnection, input: PositionInput) {
  return withDatabaseTransaction(db, tx => readPersonnelFiscalPositionInTransaction(tx, input), { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

export async function readPersonnelFiscalPositionInTransaction(db: DatabaseTransaction, input: PositionInput) {
  const scope = await resolveFinancialReportScope(db, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitIds: input.budgetUnitIds });
  if (!scope.fullEntity || !scope.governmentEntityId || !scope.budgetUnitIds?.length) throw new PersonnelFiscalError("Apuração de pessoal exige autorização de todas as UGs do ente.");
  const issues: string[] = [];
  if (!Number.isFinite(input.through.getTime()) || input.through.getUTCFullYear() !== scope.year || input.through > new Date()) throw new PersonnelFiscalError("Corte de pessoal inválido ou futuro.");
  const endOfMonth = new Date(Date.UTC(scope.year, input.through.getUTCMonth() + 1, 1) - 1);
  if (input.through.getTime() !== endOfMonth.getTime()) issues.push("Corte deve encerrar uma competência mensal completa.");
  const start = new Date(Date.UTC(scope.year, input.through.getUTCMonth() - 11, 1));
  const months = Array.from({ length: 12 }, (_, at) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + at, 1)));
  const definition = await readPersonnelFiscalDefinition(db, input.financialYearId, input.through);
  const years = await listPersonnelFiscalYears(db, scope.governmentEntityId, [...new Set(months.map(month => month.getUTCFullYear()))]);
  const closes = await listPersonnelFiscalCloses(db, years.map(year => year.id), start, input.through);
  for (const month of months) if (!closes.some(close => close.competence.getTime() === month.getTime())) issues.push(`Competência ${month.toISOString().slice(0, 7)} sem fechamento confirmado do ente.`);
  if (!definition) issues.push("Composição de pessoal/RCL ajustada e limites do ente não configurados.");
  const rows: Array<{ section: string; label: string; amount: string; entryIds: string[] }> = [];
  const base = { governmentEntityId: scope.governmentEntityId, financialYearId: input.financialYearId, from: start.toISOString(), through: input.through.toISOString(), definitionId: definition?.id ?? null, legalReference: definition?.legalReference ?? null, revision: definition?.revision ?? null, legalLimit: definition?.legalLimit.toFixed(4) ?? null, prudentialLimit: definition?.prudentialLimit.toFixed(4) ?? null, alertLimit: definition?.alertLimit.toFixed(4) ?? null };
  if (!definition) return { ...base, status: "NOT_EVALUATED" as const, issues, personnel: null, adjustedRcl: null, percentage: null, rows, sourceHash: null };
  const config = personnelFiscalComposition.parse(definition.definition);
  const components = [...config.personnel, ...config.adjustedRcl];
  const entries = await listPersonnelFiscalEntries(db, { accountIds: [...new Set(components.flatMap(component => component.accountIds))], yearIds: years.map(year => year.id), governmentEntityId: scope.governmentEntityId, unitIds: scope.budgetUnitIds, start, through: input.through });
  const total = (section: string, selection: z.infer<typeof term>[]) => {
    let sum = new Decimal(0); const used = new Set<string>();
    for (const component of selection) {
      let amount = new Decimal(0); const entryIds: string[] = [];
      for (const entry of entries) {
        const transaction = entry.transaction!;
        const origin = transaction.reversalOfId ? transaction.reversalOf : transaction;
        if (!origin || origin.governmentEntityId !== scope.governmentEntityId) { issues.push(`Estorno ${transaction.id} sem origem conciliada no ente.`); continue; }
        if (!component.accountIds.includes(entry.accountId) || (component.budgetUnitIds && !component.budgetUnitIds.includes(transaction.budgetUnitId!)) || (component.sourceTypes && !component.sourceTypes.includes(origin.sourceType))) continue;
        if (used.has(entry.id)) { issues.push(`Partida ${entry.id} duplicada em componentes de ${section}.`); continue; }
        used.add(entry.id);
        if (!entry.valueDecimal || !["Débito", "Crédito"].includes(entry.type)) { issues.push(`Partida ${entry.id} sem Decimal/sinal conciliado.`); continue; }
        const sign = (entry.type === "Débito") === (component.side === "DEBIT_NET") ? 1 : -1;
        amount = amount.plus(entry.valueDecimal.mul(sign).mul(component.operation === "ADD" ? 1 : -1)); entryIds.push(entry.id);
      }
      rows.push({ section, label: component.label, amount: amount.toFixed(2), entryIds }); sum = sum.plus(amount);
    }
    return sum;
  };
  const personnel = total("PERSONNEL", config.personnel), adjustedRcl = total("ADJUSTED_RCL", config.adjustedRcl);
  if (personnel.lt(0)) issues.push("Despesa líquida de pessoal negativa exige conciliação.");
  if (adjustedRcl.lte(0)) issues.push("RCL ajustada inexistente ou não positiva.");
  const percentage = adjustedRcl.gt(0) ? personnel.mul(100).div(adjustedRcl) : null;
  const status = issues.length ? "NOT_EVALUATED" as const : percentage!.gt(definition.legalLimit) ? "EXCEDIDO" as const : percentage!.gt(definition.prudentialLimit) ? "PRUDENCIAL" as const : percentage!.gt(definition.alertLimit) ? "ALERTA" as const : "REGULAR" as const;
  return { ...base, status, issues: [...new Set(issues)], personnel: personnel.toFixed(2), adjustedRcl: adjustedRcl.toFixed(2), percentage: issues.length ? null : percentage!.toFixed(4), rows, sourceHash: hash({ definitionId: definition.id, rows, closes: closes.map(close => ({ id: close.id, competence: close.competence.toISOString() })), entries: entries.map(entry => ({ id: entry.id, amount: entry.valueDecimal?.toFixed(2), type: entry.type, transactionId: entry.transactionId })) }) };
}
