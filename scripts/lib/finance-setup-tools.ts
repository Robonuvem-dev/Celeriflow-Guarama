import { and, asc, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { createDatabaseConnection, type DatabaseConnection } from '../../src/db/connection';
import type { DatabaseExecutor, DatabaseTransaction } from '../../src/db/transaction';
import type { JsonObject, JsonValue } from '../../src/db/json';
import * as t from '../../src/db/schema/finance-setup-tools';
import { FinanceError } from '../../src/lib/financeiro/errors';
import { countKnownBankSources, hasPendingSourcePayment, hasPendingSourceWithholding, hasUndocumentedBankSources, readBankSourceAccount } from '../../src/db/repositories/finance/bank-sources';
import { getBankResourceSourceBalance } from '../../src/lib/financeiro/bank-resource-sources';

export type SetupActor = { id: string; ativo: boolean; firebaseUid: string | null; employeeId: string | null; perfil: { codigo: string } };
export type SetupCatalogEntry = { id: string; versionId: string; kind: string; code: string; name: string; degree: number; canonicalId: string; attributes: JsonValue };
export type SetupScope = { governmentEntityId: string; budgetUnitId: string };
export const setupObject = (value: JsonValue | undefined): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const setupJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export function openFinanceSetupConnection(acquisitionTimeoutMs = 10_000): DatabaseConnection {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  connection.pool.options.connectionTimeoutMillis = acquisitionTimeoutMs;
  return connection;
}
export function setupRequired<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`${label} não encontrado.`);
  return value;
}
export async function readSetupActor(db: DatabaseExecutor, firstAuthenticated = false): Promise<SetupActor> {
  const rows = await db.select({ id: t.setupUsers.id, ativo: t.setupUsers.ativo, firebaseUid: t.setupUsers.firebaseUid, employeeId: t.setupUsers.employeeId, perfil: { codigo: t.setupProfiles.codigo } }).from(t.setupUsers).innerJoin(t.setupProfiles, eq(t.setupProfiles.id, t.setupUsers.perfilId)).where(firstAuthenticated ? and(eq(t.setupUsers.ativo, true), isNotNull(t.setupUsers.firebaseUid), eq(t.setupProfiles.codigo, 'SYSTEM_ADMINISTRATOR')) : eq(t.setupUsers.email, 'admin@email.com')).orderBy(...(firstAuthenticated ? [asc(t.setupUsers.id)] : [])).limit(1);
  return setupRequired(rows[0], 'Usuário');
}
export async function readSetupYear(db: DatabaseExecutor, governmentEntityId: string, year = 2026): Promise<{ id: string; year: number; status: string; governmentEntityId: string | null }> {
  return setupRequired((await db.select({ id: t.setupYears.id, year: t.setupYears.year, status: t.setupYears.status, governmentEntityId: t.setupYears.governmentEntityId }).from(t.setupYears).where(and(eq(t.setupYears.governmentEntityId, governmentEntityId), eq(t.setupYears.year, year))).limit(1))[0], 'Exercício');
}
export async function readSetupAudit(db: DatabaseExecutor, action: string, entityId: string): Promise<{ id: string; payload: JsonValue | null } | null> {
  return (await db.select({ id: t.setupAudits.id, payload: t.setupAudits.payload }).from(t.setupAudits).where(and(eq(t.setupAudits.action, action), eq(t.setupAudits.entityId, entityId))).limit(1))[0] ?? null;
}
export async function readSetupBinding(db: DatabaseExecutor, budgetUnitId: string): Promise<{ governmentEntityId: string }> {
  return setupRequired((await db.select({ governmentEntityId: t.setupBindings.governmentEntityId }).from(t.setupBindings).where(eq(t.setupBindings.budgetUnitId, budgetUnitId)).limit(1))[0], 'Vínculo da UG');
}
export async function readSetupVersion(db: DatabaseExecutor, id: string): Promise<{ id: string; year: number; sourceHash: string }> {
  return setupRequired((await db.select({ id: t.setupCatalogVersions.id, year: t.setupCatalogVersions.year, sourceHash: t.setupCatalogVersions.sourceHash }).from(t.setupCatalogVersions).where(eq(t.setupCatalogVersions.id, id)).limit(1))[0], 'Versão do catálogo');
}
export async function readSetupEntry(db: DatabaseExecutor, id: string): Promise<SetupCatalogEntry> {
  return setupRequired((await db.select().from(t.setupCatalogEntries).where(eq(t.setupCatalogEntries.id, id)).limit(1))[0], 'Entrada do catálogo');
}
export async function readSetupPredecessor(db: DatabaseExecutor, canonicalId: string, budgetUnitId: string): Promise<SetupCatalogEntry> {
  const [row] = await db.select({ entry: t.setupCatalogEntries }).from(t.setupCatalogEntries).innerJoin(t.setupCatalogVersions, eq(t.setupCatalogVersions.id, t.setupCatalogEntries.versionId)).where(and(eq(t.setupCatalogEntries.canonicalId, canonicalId), eq(t.setupCatalogVersions.status, 'PUBLISHED'), sql`${t.setupCatalogEntries.attributes} #> '{budgetUnitId}' = ${JSON.stringify(budgetUnitId)}::jsonb`)).limit(1);
  return setupRequired(row?.entry, 'Classificação predecessora');
}
type SetupRule = { id: string; isActive: boolean; isReference: boolean; debitAccountId: string; creditAccountId: string; components: Array<{ id: string }> };
export async function readSetupEvent(db: DatabaseExecutor, code: string, activeOnly = false): Promise<{ isActive: boolean; rules: SetupRule[] } | null> {
  const [event] = await db.select({ id: t.setupEvents.id, isActive: t.setupEvents.isActive }).from(t.setupEvents).where(eq(t.setupEvents.code, code)).limit(1);
  if (!event) return null;
  const rules = await db.select({ id: t.setupRules.id, isActive: t.setupRules.isActive, isReference: t.setupRules.isReference, debitAccountId: t.setupRules.debitAccountId, creditAccountId: t.setupRules.creditAccountId }).from(t.setupRules).where(and(eq(t.setupRules.eventId, event.id), activeOnly ? eq(t.setupRules.isActive, true) : undefined));
  const components = rules.length ? await db.select({ id: t.setupComponents.id, ruleId: t.setupComponents.ruleId }).from(t.setupComponents).where(inArray(t.setupComponents.ruleId, rules.map(rule => rule.id))) : [];
  return { isActive: event.isActive, rules: rules.map(rule => ({ ...rule, components: components.filter(component => component.ruleId === rule.id) })) };
}
export async function readSetupBankAccount(db: DatabaseExecutor, id: string): Promise<{ id: string; isActive: boolean; resourceSourceId: string | null; budgetUnitId: string | null; governmentEntityId: string | null; permittedSources: Array<{ resourceSourceId: string }> }> {
  const [row] = await db.select({ id: t.setupBankAccounts.id, isActive: t.setupBankAccounts.isActive, resourceSourceId: t.setupBankAccounts.resourceSourceId, budgetUnitId: t.setupBankAccounts.budgetUnitId, governmentEntityId: t.setupBindings.governmentEntityId }).from(t.setupBankAccounts).leftJoin(t.setupUnits, eq(t.setupUnits.id, t.setupBankAccounts.budgetUnitId)).leftJoin(t.setupBindings, eq(t.setupBindings.budgetUnitId, t.setupUnits.id)).where(eq(t.setupBankAccounts.id, id)).limit(1);
  const account = setupRequired(row, 'Conta bancária');
  const permittedSources = await db.select({ resourceSourceId: t.setupBankPermissions.resourceSourceId }).from(t.setupBankPermissions).where(and(eq(t.setupBankPermissions.bankAccountId, id), eq(t.setupBankPermissions.isActive, true)));
  return { ...account, permittedSources };
}
export async function createSetupEdition(tx: DatabaseTransaction, version: { id: string; year: number; label: string; status: string; sourceHash: string; normativeReference: string; createdById: string }, entries: Array<{ kind: string; code: string; name: string; degree: number; canonicalId: string; attributes: JsonValue }>): Promise<void> {
  await tx.insert(t.setupCatalogVersions).values(version);
  if (entries.length) await tx.insert(t.setupCatalogEntries).values(entries.map(entry => ({ ...entry, versionId: version.id })));
}
export async function publishSetupEdition(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.update(t.setupCatalogVersions).set({ status: 'PUBLISHED' }).where(eq(t.setupCatalogVersions.id, id));
}
export async function setupFingerprint(db: DatabaseExecutor, name: 'AccountingTransaction' | 'AccountingEntry' | 'Revenue' | 'TaxAssessment' | 'TaxGuide' | 'TaxPayment' | 'TreasuryMovement' | 'Commitment' | 'Settlement' | 'Payment'): Promise<string> {
  const [row] = (await db.execute<{ fingerprint: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) AS fingerprint FROM ${sql.identifier(name)} t`)).rows;
  return row.fingerprint;
}

/** Transaction-only adoption used by these tools: one principal pair, no
 * component replacement. Preserve the core command's lock/upsert/audit in the
 * caller's real transaction, rather than adapting a client with a fake API. */
export async function adoptSetupPostingRule(tx: DatabaseTransaction, actor: { usuarioId: string; employeeId: string | null }, input: { eventCode: string; eventName: string; debitAccountId: string; creditAccountId: string; description?: string; isReference?: boolean }): Promise<void> {
  if (!input.eventCode.trim() || !input.eventName.trim()) throw new FinanceError('Codigo e nome do evento contabil sao obrigatorios.');
  if (input.debitAccountId === input.creditAccountId) throw new FinanceError('A regra contabil exige contas de debito e credito diferentes.');
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTING_RULE:${input.eventCode.trim()}`}, 0))::text`);
  const accountIds = [...new Set([input.debitAccountId, input.creditAccountId])];
  const accounts = await tx.select({ id: t.setupPlans.id }).from(t.setupPlans).where(inArray(t.setupPlans.id, accountIds));
  if (accounts.length !== accountIds.length) throw new FinanceError('As contas da regra contabil nao foram encontradas.');
  const description = input.description?.trim() || undefined;
  const [event] = await tx.insert(t.setupEvents).values({ code: input.eventCode.trim(), name: input.eventName.trim(), description }).onConflictDoUpdate({ target: t.setupEvents.code, set: { name: input.eventName.trim(), description, isActive: true, updatedAt: new Date() } }).returning({ id: t.setupEvents.id, code: t.setupEvents.code });
  const replaced = await tx.select({ id: t.setupRules.id }).from(t.setupRules).where(and(eq(t.setupRules.eventId, event.id), eq(t.setupRules.isActive, true), or(ne(t.setupRules.debitAccountId, input.debitAccountId), ne(t.setupRules.creditAccountId, input.creditAccountId))));
  if (replaced.length) await tx.update(t.setupRules).set({ isActive: false }).where(inArray(t.setupRules.id, replaced.map(rule => rule.id)));
  const [rule] = await tx.insert(t.setupRules).values({ eventId: event.id, debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId, description, isReference: input.isReference ?? false }).onConflictDoUpdate({ target: [t.setupRules.eventId, t.setupRules.debitAccountId, t.setupRules.creditAccountId], set: { isActive: true, description, isReference: input.isReference ?? false, updatedAt: new Date() } }).returning();
  const previousComponents = await tx.select().from(t.setupComponents).where(eq(t.setupComponents.ruleId, rule.id)).orderBy(asc(t.setupComponents.sequence));
  await tx.insert(t.setupAudits).values({ action: 'UPSERT', entityType: 'AccountingPostingRule', entityId: rule.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: setupJson({ eventCode: event.code, debitAccountId: rule.debitAccountId, creditAccountId: rule.creditAccountId, isReference: rule.isReference, replacedRuleIds: replaced.map(previous => previous.id), previousComponents, components: previousComponents }) });
}

/** Same source-permission command, composed into the setup transaction. */
export async function adoptSetupBankSources(tx: DatabaseTransaction, actor: { usuarioId: string; employeeId: string | null; allowedBudgetUnitIds?: string[] }, bankAccountId: string, resourceSourceIds: string[]): Promise<void> {
  if (!Array.isArray(resourceSourceIds) || resourceSourceIds.length > 100 || resourceSourceIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(resourceSourceIds).size !== resourceSourceIds.length) throw new Error('Informe uma lista válida de fontes permitidas, sem duplicação.');
  await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id=${bankAccountId} FOR UPDATE`);
  const account = await readBankSourceAccount(tx, bankAccountId);
  if (!account.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(account.budgetUnitId)) throw new Error('Conta bancária fora das unidades autorizadas.');
  if (!account.resourceSourceId || !resourceSourceIds.includes(account.resourceSourceId)) throw new Error('A lista de fontes deve incluir a fonte principal da conta.');
  if (await countKnownBankSources(tx, resourceSourceIds) !== resourceSourceIds.length) throw new Error('Uma das fontes não foi encontrada.');
  if (resourceSourceIds.length > 1 && await hasUndocumentedBankSources(tx, bankAccountId, undefined, false)) throw new Error('Concilie a fonte documental dos movimentos históricos antes de ativar conta multifonte.');
  for (const previous of account.permittedSources.filter(source => source.isActive && !resourceSourceIds.includes(source.resourceSourceId))) {
    if (!(await getBankResourceSourceBalance(tx, bankAccountId, previous.resourceSourceId)).isZero()) throw new Error('Não é possível remover uma fonte com saldo bancário pendente.');
    if (await hasPendingSourcePayment(tx, bankAccountId, previous.resourceSourceId)) throw new Error('Não é possível remover uma fonte com ordem emitida pendente.');
    if (await hasPendingSourceWithholding(tx, bankAccountId, previous.resourceSourceId)) throw new Error('Não é possível remover uma fonte com retenção pendente de recolhimento.');
  }
  await tx.update(t.setupBankPermissions).set({ isActive: false }).where(eq(t.setupBankPermissions.bankAccountId, bankAccountId));
  for (const resourceSourceId of resourceSourceIds) await tx.insert(t.setupBankPermissions).values({ bankAccountId, resourceSourceId, isActive: true }).onConflictDoUpdate({ target: [t.setupBankPermissions.bankAccountId, t.setupBankPermissions.resourceSourceId], set: { isActive: true, updatedAt: new Date() } });
  await tx.insert(t.setupAudits).values({ action: 'CONFIGURE_SOURCES', entityType: 'BankAccount', entityId: bankAccountId, budgetUnitId: account.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousSources: account.permittedSources.filter(source => source.isActive).map(source => source.resourceSourceId), resourceSourceIds } });
}
