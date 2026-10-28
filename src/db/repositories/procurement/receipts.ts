import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { materials, warehouses } from "@/db/schema/assets-stock";
import { documents } from "@/db/schema/registry";
import { procurementContracts, purchaseProcessItems } from "@/db/schema/procurement-core";
import { purchaseReceiptItems, purchaseReceipts } from "@/db/schema/procurement-requests";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type PurchaseReceiptsPage = {
  contracts: { id: string; number: string; process: { items: (Pick<Row<typeof purchaseProcessItems>, "id" | "quantity" | "estimatedUnitValue"> & {
    processId: string; material: Pick<Row<typeof materials>, "id" | "code" | "unitOfMeasure" | "name" | "type"> | null;
    receiptItems: { itemId: string; quantity: number }[];
  })[] } }[];
  documents: { id: string; title: string }[]; employees: { id: string; name: string }[]; warehouses: { id: string; name: string }[];
  receipts: (Row<typeof purchaseReceipts> & { contract: { number: string }; items: (Row<typeof purchaseReceiptItems> & { material: { name: string } })[] })[];
};

export async function loadPurchaseReceiptsPage(db: DatabaseExecutor): Promise<PurchaseReceiptsPage> {
  const [contracts, selectedDocuments, selectedEmployees, selectedWarehouses, recent] = await Promise.all([
    db.select({ id: procurementContracts.id, number: procurementContracts.number, processId: procurementContracts.processId }).from(procurementContracts).where(eq(procurementContracts.status, "Vigente")).orderBy(asc(procurementContracts.number)),
    db.select({ id: documents.id, title: documents.title }).from(documents).where(and(eq(documents.status, "Válido"), ne(documents.documentType, "Modelo"))).orderBy(desc(documents.createdAt)).limit(100),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
    db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.name)),
    db.select({ receipt: purchaseReceipts, contract: { number: procurementContracts.number } }).from(purchaseReceipts).innerJoin(procurementContracts, eq(procurementContracts.id, purchaseReceipts.contractId)).orderBy(desc(purchaseReceipts.receivedAt)).limit(30),
  ]);
  const [processItems, approvedItems, recentItems] = await Promise.all([
    contracts.length ? db.select({ processId: purchaseProcessItems.purchaseProcessId, id: purchaseProcessItems.id, quantity: purchaseProcessItems.quantity, estimatedUnitValue: purchaseProcessItems.estimatedUnitValue, material: { id: materials.id, code: materials.code, unitOfMeasure: materials.unitOfMeasure, name: materials.name, type: materials.type } }).from(purchaseProcessItems).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId)).where(inArray(purchaseProcessItems.purchaseProcessId, contracts.map(contract => contract.processId))) : [],
    contracts.length ? db.select({ itemId: purchaseReceiptItems.purchaseProcessItemId, quantity: purchaseReceiptItems.quantity }).from(purchaseReceiptItems).innerJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId)).where(and(eq(purchaseReceipts.status, "APPROVED"), inArray(purchaseReceipts.purchaseProcessId, contracts.map(contract => contract.processId)))) : [],
    recent.length ? db.select({ item: purchaseReceiptItems, material: { name: materials.name } }).from(purchaseReceiptItems).innerJoin(materials, eq(materials.id, purchaseReceiptItems.materialId)).where(inArray(purchaseReceiptItems.purchaseReceiptId, recent.map(row => row.receipt.id))) : [],
  ]);
  return {
    contracts: contracts.map(contract => ({ id: contract.id, number: contract.number, process: { items: processItems.filter(item => item.processId === contract.processId).map(item => ({ ...item, receiptItems: approvedItems.filter(receipt => receipt.itemId === item.id) })) } })),
    documents: selectedDocuments, employees: selectedEmployees, warehouses: selectedWarehouses,
    receipts: recent.map(row => ({ ...row.receipt, contract: row.contract, items: recentItems.filter(item => item.item.purchaseReceiptId === row.receipt.id).map(item => ({ ...item.item, material: item.material })) })),
  };
}
