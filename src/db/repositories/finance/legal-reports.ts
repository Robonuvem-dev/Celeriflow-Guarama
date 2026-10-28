import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { accountingEntries, accountingPlans, accountingTransactions } from "../../schema/finance-accounting";
import { budgetAppropriations, commitments, commitmentMovements } from "../../schema/finance-budget";
import { settlements } from "../../schema/finance-settlements";
import { payments, paymentRetentions, withholdingPayables } from "../../schema/finance-payments";
import { revenues } from "../../schema/finance-revenues";
import { planningExpenseNatures, planningRevenueNatures, planningForecasts, planningFixations } from "../../schema/planning-legal";
import { planningBudgetLaws, planningEntityUnits } from "../../schema/planning-budget";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";

export type LegalReportFilter = { financialYearId: string; governmentEntityId?: string; budgetUnitId?: string; budgetUnitIds?: string[]; startDate?: Date; endDate?: Date };
const postingScope = (filter: LegalReportFilter) => and(eq(accountingTransactions.financialYearId, filter.financialYearId), eq(accountingTransactions.status, "POSTADO"), filter.governmentEntityId ? eq(accountingTransactions.governmentEntityId, filter.governmentEntityId) : undefined, filter.budgetUnitId ? eq(accountingTransactions.budgetUnitId, filter.budgetUnitId) : undefined, filter.budgetUnitIds ? inArray(accountingTransactions.budgetUnitId, filter.budgetUnitIds) : undefined, filter.startDate ? gte(accountingTransactions.date, filter.startDate) : undefined, filter.endDate ? lte(accountingTransactions.date, filter.endDate) : undefined);

export async function listLegalReportEntries(db: DatabaseExecutor, filter: LegalReportFilter & { accountId?: string }) {
  const rows = await db.select({ entry: accountingEntries, account: accountingPlans, transaction: accountingTransactions }).from(accountingEntries).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(and(postingScope(filter), filter.accountId ? eq(accountingEntries.accountId, filter.accountId) : undefined)).orderBy(asc(accountingTransactions.date));
  return rows.map(({ entry, account, transaction }) => ({ ...entry, account, transaction }));
}
export async function listLegalReportTransactions(db: DatabaseExecutor, filter: LegalReportFilter) {
  const transactions = await db.select().from(accountingTransactions).where(postingScope(filter)).orderBy(asc(accountingTransactions.date));
  const entries = transactions.length ? await db.select({ entry: accountingEntries, account: accountingPlans }).from(accountingEntries).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).where(inArray(accountingEntries.transactionId, transactions.map(row => row.id))) : [];
  return transactions.map(row => ({ ...row, entries: entries.filter(item => item.entry.transactionId === row.id).map(({ entry, account }) => ({ ...entry, account })) }));
}
export async function listLegalReportAccounts(db: DatabaseExecutor, filter: LegalReportFilter) {
  const [accounts, entries] = await Promise.all([db.select().from(accountingPlans).orderBy(asc(accountingPlans.code)), listLegalReportEntries(db, filter)]);
  return accounts.map(account => ({ ...account, entries: entries.filter(entry => entry.accountId === account.id) }));
}
export async function readRreoBudgetFacts(db: DatabaseExecutor, filter: LegalReportFilter) {
  const appropriations = await db.select({ appropriation: budgetAppropriations, expenseNature: { code: planningExpenseNatures.code, name: planningExpenseNatures.name } }).from(budgetAppropriations).innerJoin(planningExpenseNatures, eq(planningExpenseNatures.id, budgetAppropriations.expenseNatureId)).where(and(eq(budgetAppropriations.financialYearId, filter.financialYearId), filter.budgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, filter.budgetUnitIds) : undefined));
  const active = appropriations.length ? await db.select().from(commitments).where(and(inArray(commitments.appropriationId, appropriations.map(row => row.appropriation.id)), inArray(commitments.status, ["Emitido", "Liquidado", "Pago"]))) : [];
  const keys = active.map(row => row.id);
  const [movements, liquidations, paid] = keys.length ? await Promise.all([
    db.select().from(commitmentMovements).where(and(inArray(commitmentMovements.commitmentId, keys), filter.startDate ? gte(commitmentMovements.date, filter.startDate) : undefined, filter.endDate ? lte(commitmentMovements.date, filter.endDate) : undefined)),
    db.select().from(settlements).where(and(inArray(settlements.commitmentId, keys), eq(settlements.status, "Liquidado"), filter.startDate ? gte(settlements.date, filter.startDate) : undefined, filter.endDate ? lte(settlements.date, filter.endDate) : undefined)),
    db.select().from(payments).where(and(inArray(payments.commitmentId, keys), inArray(payments.status, ["Pago", "Paga"]), filter.startDate ? gte(payments.date, filter.startDate) : undefined, filter.endDate ? lte(payments.date, filter.endDate) : undefined)),
  ]) : [[], [], []];
  const period = Boolean(filter.startDate || filter.endDate);
  const included = active.map(row => ({ ...row, movements: movements.filter(item => item.commitmentId === row.id), settlements: liquidations.filter(item => item.commitmentId === row.id), payments: paid.filter(item => item.commitmentId === row.id) })).filter(row => !period || ((!filter.startDate || row.date >= filter.startDate) && (!filter.endDate || row.date <= filter.endDate)) || row.movements.length || row.settlements.length || row.payments.length);
  return appropriations.map(({ appropriation, expenseNature }) => ({ ...appropriation, expenseNature, commitments: included.filter(row => row.appropriationId === appropriation.id) }));
}
export async function listRreoRevenues(db: DatabaseExecutor, filter: LegalReportFilter) {
  const rows = await db.select({ revenue: revenues, revenueNature: { code: planningRevenueNatures.code, name: planningRevenueNatures.name } }).from(revenues).innerJoin(planningRevenueNatures, eq(planningRevenueNatures.id, revenues.revenueNatureId)).where(and(eq(revenues.financialYearId, filter.financialYearId), eq(revenues.stage, "ARRECADADA"), filter.budgetUnitIds ? inArray(revenues.budgetUnitId, filter.budgetUnitIds) : undefined, filter.startDate ? gte(revenues.date, filter.startDate) : undefined, filter.endDate ? lte(revenues.date, filter.endDate) : undefined));
  return rows.map(({ revenue, revenueNature }) => ({ ...revenue, revenueNature }));
}
export async function readPublishedRreoEstimates(db: DatabaseExecutor, financialYearId: string) {
  const laws = await db.select({ id: planningBudgetLaws.id }).from(planningBudgetLaws).where(and(eq(planningBudgetLaws.financialYearId, financialYearId), eq(planningBudgetLaws.status, "PUBLISHED")));
  if (!laws.length) return { forecasts: [], fixations: [] };
  const keys = laws.map(row => row.id);
  const [forecasts, fixations] = await Promise.all([db.select().from(planningForecasts).where(inArray(planningForecasts.annualBudgetLawId, keys)), db.select().from(planningFixations).where(inArray(planningFixations.annualBudgetLawId, keys))]);
  return { forecasts, fixations };
}
export async function listLegalFinancialWithholdings(db: DatabaseExecutor, filter: LegalReportFilter) {
  const rows = await db.select({ note: withholdingPayables }).from(withholdingPayables).innerJoin(paymentRetentions, eq(paymentRetentions.id, withholdingPayables.retentionId)).innerJoin(payments, eq(payments.id, paymentRetentions.paymentId)).innerJoin(commitments, eq(commitments.id, payments.commitmentId)).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).where(and(eq(budgetAppropriations.financialYearId, filter.financialYearId), filter.budgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, filter.budgetUnitIds) : undefined));
  return rows.map(row => row.note);
}
export async function listLegalFinancialTreasury(db: DatabaseExecutor, filter: LegalReportFilter) {
  const rows = await db.select({ movement: reconciliationTreasuryMovements }).from(reconciliationTreasuryMovements).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, reconciliationTreasuryMovements.bankAccountId)).leftJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, reconciliationBankAccounts.budgetUnitId)).where(and(eq(reconciliationTreasuryMovements.status, "Confirmado"), eq(reconciliationBankAccounts.isActive, true), filter.governmentEntityId ? eq(planningEntityUnits.governmentEntityId, filter.governmentEntityId) : undefined, filter.budgetUnitId ? eq(reconciliationBankAccounts.budgetUnitId, filter.budgetUnitId) : undefined, filter.budgetUnitIds ? inArray(reconciliationBankAccounts.budgetUnitId, filter.budgetUnitIds) : undefined));
  return rows.map(row => row.movement);
}
