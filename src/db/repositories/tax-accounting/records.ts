import { and, eq, gte, isNull, lte, or, sql, type SQLWrapper } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions } from "@/db/schema/finance-accounting";
import { financialYears } from "@/db/schema/finance-years";
import { planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "@/db/schema/planning-catalog";
import { taxAssessments, taxGuides, taxes } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxActiveDebts, taxFinancialMappings, taxIntegrationEvents, taxPayments } from "@/db/schema/tax-accounting";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "@/db/schema/finance-reconciliation";
import { revenues, taxRevenueIntegrations } from "@/db/schema/finance-revenues";

export function requiredTaxRecord<T>(record: T | undefined | null, entity: string): T {
  if (!record) throw new Error(`${entity} não encontrado.`);
  return record;
}

export function taxAccountingObject(value?: JsonValue | null): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** JSON string equality, not text coercion (a JSON number is not an ID string). */
export function taxJsonString(column: SQLWrapper, key: string, value: string) {
  return sql`${column}->${key} = ${JSON.stringify(value)}::jsonb`;
}

export async function lockTaxAccountingRow(tx: DatabaseExecutor, table: "TaxAssessment" | "TaxGuide" | "ActiveDebt" | "TaxRegistryEntry" | "BankAccount", id: string) {
  await tx.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id = ${id} FOR UPDATE`);
}

export async function lockTaxAccountingKey(tx: DatabaseExecutor, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}

export async function readTaxAssessment(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, id)).limit(1))[0], "Lançamento tributário");
}

export async function readTaxGuide(tx: DatabaseExecutor, id: string) {
  const guide = requiredTaxRecord((await tx.select().from(taxGuides).where(eq(taxGuides.id, id)).limit(1))[0], "Guia tributária");
  return { ...guide, assessment: await readTaxAssessment(tx, guide.assessmentId) };
}

export async function readTaxRegistryEntry(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1))[0], "Registro tributário");
}

export async function readTaxBankAccount(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, id)).limit(1))[0], "Conta bancária");
}

export async function readTaxTreasuryMovement(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.id, id)).limit(1))[0], "Movimento de tesouraria");
}

export async function readTaxActiveDebt(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.id, id)).limit(1))[0], "Dívida ativa");
}

export async function readTaxEntityBinding(tx: DatabaseExecutor, budgetUnitId: string) {
  return requiredTaxRecord((await tx.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId)).limit(1))[0], "Vínculo da UG");
}

export async function readTaxDefinition(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(taxes).where(eq(taxes.id, id)).limit(1))[0], "Tributo");
}

export async function readTaxAccountingPlan(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord((await tx.select().from(accountingPlans).where(eq(accountingPlans.id, id)).limit(1))[0], "Conta contábil");
}

export async function findTaxAccountingCatalog(tx: DatabaseExecutor, id: string) {
  const catalog = (await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, id)).limit(1))[0];
  if (!catalog) return null;
  return { ...catalog, entries: await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, id)) };
}

export async function readTaxAccountingCatalog(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord(await findTaxAccountingCatalog(tx, id), "Edição contábil");
}

export async function findTaxAccountingTransaction(tx: DatabaseExecutor, id: string) {
  const transaction = (await tx.select().from(accountingTransactions).where(eq(accountingTransactions.id, id)).limit(1))[0];
  if (!transaction) return null;
  const entries = await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, id));
  const reversedBy = (await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, id)).limit(1))[0] ?? null;
  const financialYear = requiredTaxRecord((await tx.select().from(financialYears).where(eq(financialYears.id, transaction.financialYearId)).limit(1))[0], "Exercício financeiro");
  return { ...transaction, entries, reversedBy, financialYear };
}

export async function readTaxAccountingTransaction(tx: DatabaseExecutor, id: string) {
  return requiredTaxRecord(await findTaxAccountingTransaction(tx, id), "Partida contábil");
}

export async function findTaxAccountingEvent(tx: DatabaseExecutor, code: string, activeRulesOnly = true) {
  const event = (await tx.select().from(accountingEvents).where(eq(accountingEvents.code, code)).limit(1))[0];
  if (!event) return null;
  const rules = await tx.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), activeRulesOnly ? eq(accountingRules.isActive, true) : undefined));
  return { ...event, rules };
}

export async function findTaxIntegrationEventByKey(tx: DatabaseExecutor, key: string) {
  return (await tx.select().from(taxIntegrationEvents).where(eq(taxIntegrationEvents.idempotencyKey, key)).limit(1))[0] ?? null;
}

export async function findTaxPaymentByKey(tx: DatabaseExecutor, key: string) {
  const payment = (await tx.select().from(taxPayments).where(eq(taxPayments.idempotencyKey, key)).limit(1))[0];
  return payment ? hydrateTaxPayment(tx, payment) : null;
}

async function hydrateTaxPayment(tx: DatabaseExecutor, payment: typeof taxPayments.$inferSelect) {
  const guide = await readTaxGuide(tx, payment.guideId);
  const tax = await readTaxDefinition(tx, guide.assessment.taxId);
  const integration = (await tx.select().from(taxRevenueIntegrations).where(eq(taxRevenueIntegrations.taxPaymentId, payment.id)).limit(1))[0];
  let revenueIntegration = null;
  if (integration) {
    const revenue = requiredTaxRecord((await tx.select().from(revenues).where(eq(revenues.id, integration.revenueId)).limit(1))[0], "Receita");
    const financialYear = revenue.financialYearId ? (await tx.select().from(financialYears).where(eq(financialYears.id, revenue.financialYearId)).limit(1))[0] ?? null : null;
    revenueIntegration = { ...integration, revenue: { ...revenue, financialYear } };
  }
  return { ...payment, guide: { ...guide, assessment: { ...guide.assessment, tax } }, revenueIntegration };
}

export async function readTaxPayment(tx: DatabaseExecutor, id: string) {
  const payment = requiredTaxRecord((await tx.select().from(taxPayments).where(eq(taxPayments.id, id)).limit(1))[0], "Pagamento tributário");
  return hydrateTaxPayment(tx, payment);
}

export async function readConfirmedTaxAssessmentPayments(tx: DatabaseExecutor, assessmentId: string) {
  return tx.select({ guideId: taxPayments.guideId, amountPaidDecimal: taxPayments.amountPaidDecimal }).from(taxPayments)
    .innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, assessmentId), eq(taxPayments.status, "Confirmado")));
}

export function taxProfilePeriod(taxId: string, category: "ACCOUNTING_PROFILE" | "DEBT_ACCOUNTING_PROFILE", budgetUnitId: string, from: Date, through = from) {
  return and(eq(taxRegistryEntries.entityType, "TAX"), eq(taxRegistryEntries.entityId, taxId), eq(taxRegistryEntries.category, category), eq(taxRegistryEntries.status, "ATIVO"), lte(taxRegistryEntries.effectiveFrom, through), or(isNull(taxRegistryEntries.effectiveUntil), gte(taxRegistryEntries.effectiveUntil, from)), taxJsonString(taxRegistryEntries.data, "budgetUnitId", budgetUnitId));
}

export function taxAssessmentPosition(assessmentId: string, category: string, status = "ATIVO") {
  return and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, assessmentId), eq(taxRegistryEntries.category, category), eq(taxRegistryEntries.status, status));
}

export async function findTaxFinancialMapping(tx: DatabaseExecutor, taxId: string) {
  const mapping = (await tx.select().from(taxFinancialMappings).where(eq(taxFinancialMappings.taxId, taxId)).limit(1))[0];
  return mapping ? { ...mapping, tax: await readTaxDefinition(tx, mapping.taxId), defaultBankAccount: await readTaxBankAccount(tx, mapping.defaultBankAccountId) } : null;
}
