import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { FinancePageAccess } from "@/lib/contracts/finance-pages";
import { Decimal } from "../../decimal";
import { processes } from "../../schema/processes";
import { procurementContracts } from "../../schema/procurement-core";
import { procurementCovenants } from "../../schema/procurement-instruments";
import { purchaseReceiptItems, purchaseReceipts } from "../../schema/procurement-requests";
import { infrastructureServices } from "../../schema/infrastructure";
import { budgetAppropriations } from "../../schema/finance-budget";
import { expenses } from "../../schema/finance-expenses";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { financePageCampaigns, financePageCreditItems, financePageCredits, financePageDebts } from "../../schema/finance-pages";

export async function readFinanceCommitmentOrigins(db: DatabaseExecutor) {
  const [processRows, contracts, obrasServices, covenants, publicityCampaigns, fundedDebts] = await Promise.all([
    db.select({ id: processes.id, protocolNumber: processes.protocolNumber, description: processes.description }).from(processes).orderBy(desc(processes.createdAt)).limit(100),
    db.select({ id: procurementContracts.id, number: procurementContracts.number, object: procurementContracts.object, supplierId: procurementContracts.supplierId, status: procurementContracts.status }).from(procurementContracts).orderBy(desc(procurementContracts.createdAt)).limit(100),
    db.select({ id: infrastructureServices.id, protocolo: infrastructureServices.protocolo, tipo: infrastructureServices.tipo, descricao: infrastructureServices.descricao, local: infrastructureServices.local,
      budgetAppropriationId: infrastructureServices.budgetAppropriationId, budgetAppropriation: { code: budgetAppropriations.code } }).from(infrastructureServices)
      .leftJoin(budgetAppropriations, eq(budgetAppropriations.id, infrastructureServices.budgetAppropriationId)).where(and(eq(infrastructureServices.active, true), isNull(infrastructureServices.commitmentId))).orderBy(desc(infrastructureServices.createdAt)).limit(100),
    db.select({ id: procurementCovenants.id, number: procurementCovenants.number, grantor: procurementCovenants.grantor, startDate: procurementCovenants.startDate, endDate: procurementCovenants.endDate }).from(procurementCovenants).where(eq(procurementCovenants.status, "Ativo")).orderBy(asc(procurementCovenants.number)),
    db.select({ id: financePageCampaigns.id, name: financePageCampaigns.name, agency: financePageCampaigns.agency, startDate: financePageCampaigns.startDate, endDate: financePageCampaigns.endDate }).from(financePageCampaigns).where(eq(financePageCampaigns.status, "Ativa")).orderBy(asc(financePageCampaigns.name)),
    db.select({ id: financePageDebts.id, lawNumber: financePageDebts.lawNumber, creditorName: financePageDebts.creditorName }).from(financePageDebts).where(eq(financePageDebts.status, "Ativa")).orderBy(asc(financePageDebts.lawNumber)),
  ]);
  return { processes: processRows, contracts, obrasServices, covenants, publicityCampaigns, fundedDebts };
}

export async function listFinancePageCreditRequests(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  // Universal quantification preserves the legacy empty-items case. A denied
  // item rejects the entire request, including mixed-UG credit requests.
  return db.select().from(financePageCredits).where(access.allowedBudgetUnitIds ? sql`NOT EXISTS (
    SELECT 1 FROM ${financePageCreditItems} INNER JOIN ${budgetAppropriations} ON ${budgetAppropriations.id}=${financePageCreditItems.appropriationId}
    WHERE ${financePageCreditItems.creditRequestId}=${financePageCredits.id} AND ${notInArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds)}
  )` : undefined).orderBy(desc(financePageCredits.createdAt)).limit(50);
}

export async function listFinancePageExpenses(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const rows = await db.select({ expense: expenses, appropriation: { code: budgetAppropriations.code },
    supplier: { id: suppliers.id }, company: { corporateName: companies.corporateName }, person: { fullName: people.fullName } }).from(expenses)
    .innerJoin(budgetAppropriations, eq(budgetAppropriations.id, expenses.appropriationId)).leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
    .leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .where(and(inArray(expenses.status, ["Solicitada", "Aprovada"]), access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined))
    .orderBy(desc(expenses.createdAt)).limit(50);
  return rows.map(({ expense, appropriation, supplier, company, person }) => ({ ...expense, appropriation, supplier: supplier ? { ...supplier, company, person } : null }));
}

export async function listFinancePageUnboundReceipts(db: DatabaseExecutor) {
  const receipts = await db.select({ id: purchaseReceipts.id, number: purchaseReceipts.number,
    contract: { secretariatId: procurementContracts.secretariatId, number: procurementContracts.number } }).from(purchaseReceipts)
    .innerJoin(procurementContracts, eq(procurementContracts.id, purchaseReceipts.contractId))
    .where(and(eq(purchaseReceipts.status, "APPROVED"), sql`NOT EXISTS (SELECT 1 FROM ${expenses} WHERE ${expenses.purchaseReceiptId}=${purchaseReceipts.id})`))
    .orderBy(desc(purchaseReceipts.receivedAt)).limit(50);
  // These two physical columns are float8. Decode their textual representation
  // before multiplication; do not introduce a second binary float rounding step.
  const items = await db.select({ purchaseReceiptId: purchaseReceiptItems.purchaseReceiptId,
    quantity: sql<string>`${purchaseReceiptItems.quantity}::text`, unitCost: sql<string>`${purchaseReceiptItems.unitCost}::text` }).from(purchaseReceiptItems)
    .where(inArray(purchaseReceiptItems.purchaseReceiptId, receipts.map(row => row.id)));
  return receipts.map(receipt => ({ ...receipt, value: items.filter(item => item.purchaseReceiptId === receipt.id).reduce((total, item) => total.plus(new Decimal(item.quantity).times(item.unitCost)), new Decimal(0)).toNumber() }));
}
