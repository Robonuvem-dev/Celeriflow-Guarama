import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { monthlyAccountingCloses } from "../../schema/finance-accounting";
import { payableCarryForwards } from "../../schema/finance-payables";
import { budgetAppropriations, commitments } from "../../schema/finance-budget";
import { reconciliationBankAccounts, reconciliationTreasuryMovements, bankReconciliations } from "../../schema/finance-reconciliation";
import { planningBudgetUnits, planningEntityUnits } from "../../schema/planning-budget";
import { planningResourceSources } from "../../schema/planning-legal";
import { documents } from "../../schema/registry";
import { documentVersions } from "../../schema/document-workflow";
import { institutions } from "../../schema/administration";
import type { FinancialReportScope } from "@/lib/contracts/finance-scope";

const bankScope = (scope: FinancialReportScope) => and(scope.governmentEntityId ? eq(planningEntityUnits.governmentEntityId, scope.governmentEntityId) : undefined, scope.budgetUnitId ? eq(reconciliationBankAccounts.budgetUnitId, scope.budgetUnitId) : undefined, scope.budgetUnitIds ? inArray(reconciliationBankAccounts.budgetUnitId, scope.budgetUnitIds) : undefined);
const bankLabel = { bankName: reconciliationBankAccounts.bankName, agency: reconciliationBankAccounts.agency, accountNumber: reconciliationBankAccounts.accountNumber, accountType: reconciliationBankAccounts.accountType };
const unitLabel = { code: planningBudgetUnits.code, name: planningBudgetUnits.name };
const sourceLabel = { code: planningResourceSources.code, name: planningResourceSources.name };

export async function readFinanceReportInstitution(db: DatabaseExecutor) {
  const [row] = await db.select({ name: institutions.name, legalName: institutions.legalName, cnpj: institutions.cnpj, address: institutions.address, city: institutions.city, state: institutions.state }).from(institutions).orderBy(asc(institutions.createdAt)).limit(1);
  return row ?? null;
}

export async function listReportMonthlyCloses(db: DatabaseExecutor, financialYearId: string, start: Date, end: Date) {
  return db.select().from(monthlyAccountingCloses).where(and(eq(monthlyAccountingCloses.financialYearId, financialYearId), gte(monthlyAccountingCloses.competence, start), lte(monthlyAccountingCloses.competence, end))).orderBy(asc(monthlyAccountingCloses.competence));
}
export async function listReportOriginPayables(db: DatabaseExecutor, financialYearId: string, unitIds?: string[]) {
  const rows = await db.select({ payable: payableCarryForwards }).from(payableCarryForwards).innerJoin(commitments, eq(commitments.id, payableCarryForwards.commitmentId)).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).where(and(eq(payableCarryForwards.originFinancialYearId, financialYearId), unitIds ? inArray(budgetAppropriations.budgetUnitId, unitIds) : undefined)).orderBy(asc(payableCarryForwards.type));
  return rows.map(row => row.payable);
}
export async function listReportReconciliations(db: DatabaseExecutor, year: number, scope: FinancialReportScope) {
  const rows = await db.select({ reconciliation: bankReconciliations, bankAccount: bankLabel, budgetUnit: unitLabel, resourceSource: sourceLabel }).from(bankReconciliations).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, bankReconciliations.bankAccountId)).leftJoin(planningBudgetUnits, eq(planningBudgetUnits.id, reconciliationBankAccounts.budgetUnitId)).leftJoin(planningResourceSources, eq(planningResourceSources.id, reconciliationBankAccounts.resourceSourceId)).leftJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, reconciliationBankAccounts.budgetUnitId)).where(and(bankScope(scope), gte(bankReconciliations.date, new Date(Date.UTC(year, 0, 1))), lte(bankReconciliations.date, new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))))).orderBy(asc(bankReconciliations.date), asc(bankReconciliations.periodEnd));
  return rows.map(({ reconciliation, bankAccount, budgetUnit, resourceSource }) => ({ ...reconciliation, bankAccount: { ...bankAccount, budgetUnit, resourceSource } }));
}
export async function listReportTreasuryMovements(db: DatabaseExecutor, financialYearId: string, scope: FinancialReportScope) {
  const rows = await db.select({ movement: reconciliationTreasuryMovements, bankAccount: bankLabel, budgetUnit: unitLabel, resourceSource: sourceLabel }).from(reconciliationTreasuryMovements).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, reconciliationTreasuryMovements.bankAccountId)).leftJoin(planningBudgetUnits, eq(planningBudgetUnits.id, reconciliationBankAccounts.budgetUnitId)).leftJoin(planningResourceSources, eq(planningResourceSources.id, reconciliationBankAccounts.resourceSourceId)).leftJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, reconciliationBankAccounts.budgetUnitId)).where(and(eq(reconciliationTreasuryMovements.financialYearId, financialYearId), eq(reconciliationTreasuryMovements.status, "Confirmado"), bankScope(scope))).orderBy(asc(reconciliationTreasuryMovements.date), asc(reconciliationTreasuryMovements.createdAt));
  return rows.map(({ movement, bankAccount, budgetUnit, resourceSource }) => ({ ...movement, bankAccount: { ...bankAccount, budgetUnit, resourceSource } }));
}
export async function insertPublicFinanceDocumentVersion(tx: DatabaseTransaction, input: { documentType: string; title: string; url: string; hashSha256: string }) {
  const [existing] = await tx.select({ id: documents.id }).from(documents).where(eq(documents.documentType, input.documentType)).limit(1);
  const [document] = existing ? await tx.update(documents).set({ fileUrl: input.url, status: "Publicado" }).where(eq(documents.id, existing.id)).returning({ id: documents.id }) : await tx.insert(documents).values({ title: input.title, documentType: input.documentType, fileUrl: input.url, status: "Publicado" }).returning({ id: documents.id });
  const [latest] = await tx.select({ versionNumber: documentVersions.versionNumber }).from(documentVersions).where(eq(documentVersions.documentId, document.id)).orderBy(desc(documentVersions.versionNumber)).limit(1);
  const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: (latest?.versionNumber ?? 0) + 1, fileUrl: input.url, hashSha256: input.hashSha256, status: "FINAL" }).returning({ versionNumber: documentVersions.versionNumber });
  return { documentId: document.id, version: version.versionNumber };
}
