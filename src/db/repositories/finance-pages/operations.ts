import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { FinancePageAccess } from "@/lib/contracts/finance-pages";
import { employees } from "../../schema/administration";
import { people } from "../../schema/people";
import { companies, documents, suppliers } from "../../schema/registry";
import { documentVersions } from "../../schema/document-workflow";
import { budgetAppropriations, budgetReservations, commitments, commitmentMovements } from "../../schema/finance-budget";
import { expenses } from "../../schema/finance-expenses";
import { financialDocuments } from "../../schema/finance-documents";
import { payments, paymentRetentions, withholdingPayables } from "../../schema/finance-payments";
import { retentionRules, settlements } from "../../schema/finance-settlements";
import { planningBudgetUnits } from "../../schema/planning-budget";
import { planningExpenseNatures, planningResourceSources } from "../../schema/planning-legal";
import { procurementContracts } from "../../schema/procurement-core";
import { purchaseReceipts } from "../../schema/procurement-requests";
import { infrastructureServices } from "../../schema/infrastructure";

const supplierName = { id: suppliers.id, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName } };
const financialDocument = { id: financialDocuments.id, number: financialDocuments.number, title: financialDocuments.title };

export async function listFinancePageSuppliers(db: DatabaseExecutor, newest = false) {
  return db.select(supplierName).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .where(eq(suppliers.status, "Ativo")).orderBy(...(newest ? [desc(suppliers.createdAt)] : []));
}

export async function listFinancePageDocuments(db: DatabaseExecutor, mode: "receipt" | "legal" | "rap" = "receipt") {
  const query = db.select({ id: documents.id, title: documents.title, documentType: documents.documentType }).from(documents)
    .where(and(eq(documents.status, "Válido"), mode === "receipt" ? ne(documents.documentType, "Modelo") : undefined,
      mode === "legal" ? sql`EXISTS (SELECT 1 FROM ${documentVersions} WHERE ${documentVersions.documentId}=${documents.id} AND ${inArray(documentVersions.status, ["FINAL", "SIGNED"])})` : undefined))
    .orderBy(mode === "receipt" ? desc(documents.createdAt) : asc(documents.title)).$dynamic();
  return mode === "legal" ? query : query.limit(mode === "rap" ? 300 : 100);
}

export async function listFinancePageEmployees(db: DatabaseExecutor) {
  return db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name));
}

export async function listFinancePageAppropriations(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const rows = await db.select({ appropriation: budgetAppropriations, budgetUnit: planningBudgetUnits,
    expenseNature: { code: planningExpenseNatures.code, name: planningExpenseNatures.name }, resourceSource: { code: planningResourceSources.code, name: planningResourceSources.name } })
    .from(budgetAppropriations).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, budgetAppropriations.budgetUnitId))
    .innerJoin(planningExpenseNatures, eq(planningExpenseNatures.id, budgetAppropriations.expenseNatureId)).innerJoin(planningResourceSources, eq(planningResourceSources.id, budgetAppropriations.resourceSourceId))
    .where(access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined).orderBy(asc(budgetAppropriations.code));
  return rows.map(({ appropriation, ...relations }) => ({ ...appropriation, ...relations }));
}

export async function listFinancePageReservations(db: DatabaseExecutor, access: FinancePageAccess = {}, activeOnly = false) {
  const query = db.select({ reservation: budgetReservations,
    appropriation: { id: budgetAppropriations.id, code: budgetAppropriations.code }, budgetUnit: { name: planningBudgetUnits.name },
    expense: { id: expenses.id, supplierId: expenses.supplierId, sourceModule: expenses.sourceModule, sourceType: expenses.sourceType, sourceId: expenses.sourceId },
    receipt: { id: purchaseReceipts.id, number: purchaseReceipts.number, contractId: purchaseReceipts.contractId }, contract: { supplierId: procurementContracts.supplierId } })
    .from(budgetReservations).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, budgetReservations.appropriationId))
    .innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, budgetAppropriations.budgetUnitId)).leftJoin(expenses, eq(expenses.id, budgetReservations.expenseId))
    .leftJoin(purchaseReceipts, eq(purchaseReceipts.id, expenses.purchaseReceiptId)).leftJoin(procurementContracts, eq(procurementContracts.id, purchaseReceipts.contractId))
    .where(and(activeOnly ? eq(budgetReservations.status, "Ativa") : undefined, access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined))
    .orderBy(desc(budgetReservations.date)).$dynamic();
  const rows = activeOnly ? await query : await query.limit(50);
  return rows.map(({ reservation, appropriation, budgetUnit, expense, receipt, contract }) => ({ ...reservation, appropriation: { ...appropriation, budgetUnit },
    expense: expense ? { ...expense, purchaseReceipt: receipt && contract ? { ...receipt, contract } : null } : null }));
}

export async function listFinancePageCommitments(db: DatabaseExecutor, access: FinancePageAccess = {}, recent = false) {
  const query = db.select({ commitment: commitments, supplier: { id: suppliers.id }, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName },
    appropriation: { id: budgetAppropriations.id, code: budgetAppropriations.code, financialYearId: budgetAppropriations.financialYearId,
      budgetUnitId: budgetAppropriations.budgetUnitId, resourceSourceId: budgetAppropriations.resourceSourceId }, budgetUnit: { name: planningBudgetUnits.name },
    financialDocument, purchaseReceipt: { number: purchaseReceipts.number } }).from(commitments)
    .innerJoin(suppliers, eq(suppliers.id, commitments.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, budgetAppropriations.budgetUnitId))
    .leftJoin(financialDocuments, eq(financialDocuments.commitmentId, commitments.id)).leftJoin(purchaseReceipts, eq(purchaseReceipts.id, commitments.purchaseReceiptId))
    .where(and(recent ? undefined : inArray(commitments.status, ["Emitido", "Liquidado", "Pago"]), access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined)).$dynamic();
  const rows = recent ? await query.orderBy(desc(commitments.date)).limit(50) : await query;
  const ids = rows.map(row => row.commitment.id);
  const [movements, settled, obras] = await Promise.all([
    db.select({ commitmentId: commitmentMovements.commitmentId, type: commitmentMovements.type, valueDecimal: commitmentMovements.valueDecimal }).from(commitmentMovements).where(inArray(commitmentMovements.commitmentId, ids)),
    db.select({ id: settlements.id, commitmentId: settlements.commitmentId, date: settlements.date, payableCarryForwardId: settlements.payableCarryForwardId, value: settlements.value, valueDecimal: settlements.valueDecimal }).from(settlements).where(and(inArray(settlements.commitmentId, ids), eq(settlements.status, "Liquidado"))),
    db.select({ id: infrastructureServices.id, protocolo: infrastructureServices.protocolo, commitmentId: infrastructureServices.commitmentId }).from(infrastructureServices).where(inArray(infrastructureServices.commitmentId, ids)),
  ]);
  return rows.map(({ commitment, supplier, company, person, appropriation, budgetUnit, ...relations }) => ({ ...commitment, ...relations, appropriation: { ...appropriation, budgetUnit }, supplier: { ...supplier, company, person },
    movements: movements.filter(row => row.commitmentId === commitment.id), settlements: settled.filter(row => row.commitmentId === commitment.id), obrasServices: obras.filter(row => row.commitmentId === commitment.id) }));
}

export async function listFinancePageSettlements(db: DatabaseExecutor, access: FinancePageAccess = {}, recent = false) {
  const query = db.select({ settlement: settlements,
    commitment: { id: commitments.id, number: commitments.number }, appropriation: { financialYearId: budgetAppropriations.financialYearId },
    supplier: { id: suppliers.id }, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName }, purchaseReceipt: { number: purchaseReceipts.number }, author: { id: employees.id, name: employees.name }, document: { id: documents.id, title: documents.title }, financialDocument })
    .from(settlements).innerJoin(commitments, eq(commitments.id, settlements.commitmentId)).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId))
    .innerJoin(suppliers, eq(suppliers.id, commitments.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .leftJoin(purchaseReceipts, eq(purchaseReceipts.id, commitments.purchaseReceiptId)).innerJoin(employees, eq(employees.id, settlements.authorId))
    .leftJoin(documents, eq(documents.id, settlements.documentId)).leftJoin(financialDocuments, eq(financialDocuments.settlementId, settlements.id))
    .where(and(recent ? undefined : eq(settlements.status, "Liquidado"), access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined))
    .orderBy(desc(settlements.date)).$dynamic();
  const rows = recent ? await query.limit(50) : await query;
  const paid = await db.select({ settlementId: payments.settlementId, payableCarryForwardId: payments.payableCarryForwardId, valueDecimal: payments.valueDecimal, value: payments.value }).from(payments)
    .where(and(inArray(payments.settlementId, rows.map(row => row.settlement.id)), inArray(payments.status, ["Emitida", "Paga"])));
  return rows.map(({ settlement, commitment, appropriation, supplier, company, person, purchaseReceipt, ...relations }) => ({ ...settlement, ...relations, commitment: { ...commitment, appropriation, supplier: { ...supplier, company, person }, purchaseReceipt }, payments: paid.filter(row => row.settlementId === settlement.id) }));
}

export async function listFinancePageRetentionRules(db: DatabaseExecutor) {
  return db.select({ id: retentionRules.id, code: retentionRules.code, type: retentionRules.type, description: retentionRules.description,
    calculationBasePercentage: retentionRules.calculationBasePercentage, ratePercentage: retentionRules.ratePercentage, serviceCode: retentionRules.serviceCode })
    .from(retentionRules).where(eq(retentionRules.isActive, true)).orderBy(asc(retentionRules.code));
}

export async function listFinancePageWithholdings(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const rows = await db.select({ payable: withholdingPayables, retention: paymentRetentions, payment: { orderNumber: payments.orderNumber } }).from(withholdingPayables)
    .innerJoin(paymentRetentions, eq(paymentRetentions.id, withholdingPayables.retentionId)).innerJoin(payments, eq(payments.id, paymentRetentions.paymentId))
    .innerJoin(commitments, eq(commitments.id, payments.commitmentId)).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId))
    .where(and(eq(withholdingPayables.status, "Pendente"), eq(payments.status, "Paga"), access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined))
    .orderBy(desc(withholdingPayables.createdAt));
  return rows.map(({ payable, retention, payment }) => ({ ...payable, retention: { ...retention, payment } }));
}
