import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { FinancePageAccess } from "@/lib/contracts/finance-pages";
import { reconciliationBankAccounts as bankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import { financePageBankSources, financePageTransfers } from "../../schema/finance-pages";
import { planningBudgetUnits } from "../../schema/planning-budget";
import { planningEntityUnits } from "../../schema/planning-catalog";
import { governmentEntities, banks, bankBranches } from "../../schema/master-data";
import { planningResourceSources } from "../../schema/planning-legal";
import { automatedBankDownloads } from "../../schema/finance-banking";
import { integrationConnections, integrationRuns } from "../../schema/integrations";
import { budgetAppropriations, commitments } from "../../schema/finance-budget";
import { payments, paymentRetentions } from "../../schema/finance-payments";
import { settlements } from "../../schema/finance-settlements";
import { financialDocuments } from "../../schema/finance-documents";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { purchaseReceipts } from "../../schema/procurement-requests";

export async function listFinancePageBankAccounts(db: DatabaseExecutor, access: FinancePageAccess = {}, activeOnly = false) {
  const rows = await db.select({ account: bankAccounts, resourceSource: { id: planningResourceSources.id, code: planningResourceSources.code, name: planningResourceSources.name },
    budgetUnit: { id: planningBudgetUnits.id, code: planningBudgetUnits.code, name: planningBudgetUnits.name } }).from(bankAccounts)
    .leftJoin(planningResourceSources, eq(planningResourceSources.id, bankAccounts.resourceSourceId)).leftJoin(planningBudgetUnits, eq(planningBudgetUnits.id, bankAccounts.budgetUnitId))
    .where(and(activeOnly ? eq(bankAccounts.isActive, true) : undefined, access.allowedBudgetUnitIds ? inArray(bankAccounts.budgetUnitId, access.allowedBudgetUnitIds) : undefined)).orderBy(asc(bankAccounts.bankName));
  const permissions = await db.select({ bankAccountId: financePageBankSources.bankAccountId, resourceSourceId: financePageBankSources.resourceSourceId,
    resourceSource: { id: planningResourceSources.id, code: planningResourceSources.code, name: planningResourceSources.name } }).from(financePageBankSources)
    .innerJoin(planningResourceSources, eq(planningResourceSources.id, financePageBankSources.resourceSourceId))
    .where(and(eq(financePageBankSources.isActive, true), inArray(financePageBankSources.bankAccountId, rows.map(row => row.account.id))));
  return rows.map(({ account, ...relations }) => ({ ...account, ...relations, permittedSources: permissions.filter(row => row.bankAccountId === account.id) }));
}

export async function hasFinancePageUndocumentedMovement(db: DatabaseExecutor, bankAccountId: string) {
  const [row] = await db.select({ id: reconciliationTreasuryMovements.id }).from(reconciliationTreasuryMovements)
    .where(and(eq(reconciliationTreasuryMovements.bankAccountId, bankAccountId), eq(reconciliationTreasuryMovements.status, "Confirmado"), isNull(reconciliationTreasuryMovements.resourceSourceId))).limit(1);
  return Boolean(row);
}

export async function listFinancePageBudgetUnits(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const rows = await db.select({ unit: planningBudgetUnits, entity: { name: governmentEntities.name } }).from(planningBudgetUnits)
    .leftJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnits.id)).leftJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId))
    .where(access.allowedBudgetUnitIds ? inArray(planningBudgetUnits.id, access.allowedBudgetUnitIds) : undefined).orderBy(asc(planningBudgetUnits.code));
  return rows.map(({ unit, entity }) => ({ ...unit, planningEntityUnit: entity ? { governmentEntity: entity } : null }));
}

export async function listFinancePageBanks(db: DatabaseExecutor) {
  const allBanks = await db.select().from(banks).where(eq(banks.status, "ATIVO")).orderBy(asc(banks.compe));
  const branches = await db.select().from(bankBranches).where(and(eq(bankBranches.status, "ATIVA"), inArray(bankBranches.bankId, allBanks.map(row => row.id)))).orderBy(asc(bankBranches.code));
  return allBanks.map(bank => ({ ...bank, branches: branches.filter(row => row.bankId === bank.id) }));
}

export async function listFinancePageTransfers(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const source = alias(bankAccounts, "finance_page_source"), destination = alias(bankAccounts, "finance_page_destination");
  const rows = await db.select({ transfer: financePageTransfers,
    sourceBankAccount: { id: source.id, bankName: source.bankName, agency: source.agency, accountNumber: source.accountNumber, isActive: source.isActive },
    destinationBankAccount: { id: destination.id, bankName: destination.bankName, agency: destination.agency, accountNumber: destination.accountNumber, isActive: destination.isActive } }).from(financePageTransfers)
    .innerJoin(source, eq(source.id, financePageTransfers.sourceBankAccountId)).innerJoin(destination, eq(destination.id, financePageTransfers.destinationBankAccountId))
    .where(access.allowedBudgetUnitIds ? and(inArray(source.budgetUnitId, access.allowedBudgetUnitIds), inArray(destination.budgetUnitId, access.allowedBudgetUnitIds)) : undefined)
    .orderBy(desc(financePageTransfers.date), desc(financePageTransfers.createdAt)).limit(20);
  return rows.map(({ transfer, ...relations }) => ({ ...transfer, ...relations }));
}

export async function readFinancePageAutomations(db: DatabaseExecutor, bankName: string) {
  const [downloads, runs] = await Promise.all([
    db.select({ id: automatedBankDownloads.id, banco: automatedBankDownloads.banco, agencia: automatedBankDownloads.agencia, contaNumero: automatedBankDownloads.contaNumero,
      hashSHA256: automatedBankDownloads.hashSHA256, status: automatedBankDownloads.status, createdAt: automatedBankDownloads.createdAt }).from(automatedBankDownloads)
      .where(eq(automatedBankDownloads.banco, bankName)).orderBy(desc(automatedBankDownloads.createdAt)).limit(20),
    db.select({ id: integrationRuns.id, operation: integrationRuns.operation, environment: integrationRuns.environment, status: integrationRuns.status,
      message: integrationRuns.message, createdAt: integrationRuns.createdAt, connection: { name: integrationConnections.name, code: integrationConnections.code } }).from(integrationRuns)
      .innerJoin(integrationConnections, eq(integrationConnections.id, integrationRuns.connectionId)).where(eq(integrationConnections.category, "BANCARIA")).orderBy(desc(integrationRuns.createdAt)).limit(20),
  ]);
  return { downloads, runs };
}

export async function listFinancePagePayments(db: DatabaseExecutor, access: FinancePageAccess = {}, paidOnly = false) {
  const rows = await db.select({ payment: payments, commitment: { id: commitments.id, number: commitments.number, value: commitments.value, valueDecimal: commitments.valueDecimal },
    purchaseReceipt: { number: purchaseReceipts.number }, settlement: { id: settlements.id, documentRef: settlements.documentRef },
    financialDocument: { id: financialDocuments.id, number: financialDocuments.number, title: financialDocuments.title },
    bankAccount: { id: bankAccounts.id, bankName: bankAccounts.bankName, agency: bankAccounts.agency, accountNumber: bankAccounts.accountNumber, currentBalance: bankAccounts.currentBalance, currentBalanceDecimal: bankAccounts.currentBalanceDecimal },
    supplier: { id: suppliers.id }, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName } })
    .from(payments).innerJoin(commitments, eq(commitments.id, payments.commitmentId)).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId))
    .leftJoin(purchaseReceipts, eq(purchaseReceipts.id, commitments.purchaseReceiptId)).leftJoin(settlements, eq(settlements.id, payments.settlementId))
    .leftJoin(financialDocuments, eq(financialDocuments.paymentId, payments.id)).innerJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
    .innerJoin(suppliers, eq(suppliers.id, payments.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .where(and(paidOnly ? eq(payments.status, "Paga") : undefined, access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined))
    .orderBy(desc(payments.date)).limit(paidOnly ? 300 : 50);
  const retentions = await db.select({ paymentId: paymentRetentions.paymentId, valueDecimal: paymentRetentions.valueDecimal }).from(paymentRetentions).where(inArray(paymentRetentions.paymentId, rows.map(row => row.payment.id)));
  return rows.map(({ payment, commitment, purchaseReceipt, supplier, company, person, ...relations }) => ({ ...payment, ...relations,
    commitment: { ...commitment, purchaseReceipt }, supplier: { ...supplier, company, person }, retentions: retentions.filter(row => row.paymentId === payment.id) }));
}
