import { and, asc, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";
import { materials, materialStocks, materialMovements, warehouses } from "../../schema/assets-stock";
import { healthMaterialProfiles, medicineDispensations, pharmacyRequests, pharmacyRequestItems } from "../../schema/health-pharmacy";
import { medicines } from "../../schema/health-prescriptions";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { healthUnits } from "../../schema/health-workforce";
import { companies, suppliers } from "../../schema/registry";
import * as t from "../../schema/health-management-operations";
import { managementPeriod, managementUnitScope } from "./common";

export async function readManagementPharmacyRequests(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod, unmet: boolean) {
  const rows = await db.select({ item: getTableColumns(pharmacyRequestItems), material: getTableColumns(materials), request: getTableColumns(pharmacyRequests), warehouse: getTableColumns(warehouses), patient: { id: patients.id }, person: { fullName: people.fullName } }).from(pharmacyRequestItems)
    .innerJoin(materials, eq(materials.id, pharmacyRequestItems.materialId)).innerJoin(pharmacyRequests, eq(pharmacyRequests.id, pharmacyRequestItems.requestId)).innerJoin(warehouses, eq(warehouses.id, pharmacyRequests.destinationWarehouseId)).leftJoin(patients, eq(patients.id, pharmacyRequests.patientId)).leftJoin(people, eq(people.id, patients.personId))
    .where(and(unmet ? inArray(pharmacyRequests.status, ["OPEN", "PARTIAL"]) : undefined, managementPeriod(pharmacyRequests.requestedAt, period), managementUnitScope(warehouses.healthUnitId, unitIds))).orderBy(desc(pharmacyRequests.requestedAt));
  return rows.map(r => ({ ...r.item, material: r.material, request: { ...r.request, destinationWarehouse: r.warehouse, patient: r.patient && r.person ? { person: r.person } : null } }));
}

export async function readManagementDispensations(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; controlled?: boolean; recordId?: string }) {
  const receiver = alias(people, "management_receiver");
  const query = db.select({ disp: getTableColumns(medicineDispensations), medicine: getTableColumns(medicines), unit: getTableColumns(healthUnits), person: { fullName: people.fullName }, stock: getTableColumns(materialStocks), receiver: { fullName: receiver.fullName }, employeeName: sql<string | null>`(select e.name from "HealthProfessional" hp join "Employee" e on e.id=hp."employeeId" where hp.id=${medicineDispensations.dispensedByProfessionalId})` })
    .from(medicineDispensations).innerJoin(medicines, eq(medicines.id, medicineDispensations.medicineId)).innerJoin(healthUnits, eq(healthUnits.id, medicineDispensations.unitId)).innerJoin(patients, eq(patients.id, medicineDispensations.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(materialStocks, eq(materialStocks.id, medicineDispensations.stockId)).leftJoin(receiver, eq(receiver.id, medicineDispensations.receiverPersonId))
    .where(options.recordId ? or(eq(medicineDispensations.id, options.recordId), and(eq(medicineDispensations.prescriptionItemId, options.recordId), eq(medicineDispensations.status, "ACTIVE"))) : and(eq(medicineDispensations.status, "ACTIVE"), managementPeriod(medicineDispensations.date, options.period), managementUnitScope(medicineDispensations.unitId, options.unitIds), options.controlled ? eq(medicines.isControlled, true) : undefined))
    .orderBy(...(options.recordId ? [] : [desc(medicineDispensations.date)])).$dynamic();
  const rows = await (options.recordId ? query.limit(1) : query);
  return rows.map(r => ({ ...r.disp, medicine: r.medicine, unit: r.unit, patient: { person: r.person }, stock: r.stock, receiverPerson: r.receiver, dispensedByProfessional: r.employeeName === null ? null : { employee: { name: r.employeeName } } }));
}

export async function readManagementInvoiceEntries(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  const rows = await db.select({ item: getTableColumns(t.managementStockReceiptItems), receipt: getTableColumns(t.managementStockReceipts), material: { name: materials.name }, warehouse: { name: warehouses.name }, supplier: { id: suppliers.id }, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(t.managementStockReceiptItems)
    .innerJoin(t.managementStockReceipts, eq(t.managementStockReceipts.id, t.managementStockReceiptItems.receiptId)).innerJoin(materials, eq(materials.id, t.managementStockReceiptItems.materialId)).innerJoin(warehouses, eq(warehouses.id, t.managementStockReceipts.warehouseId)).leftJoin(suppliers, eq(suppliers.id, t.managementStockReceipts.supplierId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .where(and(eq(t.managementStockReceipts.status, "POSTED"), managementPeriod(t.managementStockReceipts.receivedAt, period), managementUnitScope(warehouses.healthUnitId, unitIds))).orderBy(desc(t.managementStockReceipts.receivedAt));
  return rows.map(r => ({ ...r.item, material: r.material, receipt: { ...r.receipt, warehouse: r.warehouse, supplier: r.supplier ? { person: r.person, company: r.company } : null } }));
}

export async function readManagementTransfers(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  const origin = alias(warehouses, "management_origin"), destination = alias(warehouses, "management_destination");
  const rows = await db.select({ item: getTableColumns(t.managementStockTransferItems), transfer: getTableColumns(t.managementStockTransfers), material: { name: materials.name }, origin: { name: origin.name }, destination: { name: destination.name } }).from(t.managementStockTransferItems).innerJoin(t.managementStockTransfers, eq(t.managementStockTransfers.id, t.managementStockTransferItems.transferId)).innerJoin(materials, eq(materials.id, t.managementStockTransferItems.materialId)).innerJoin(origin, eq(origin.id, t.managementStockTransfers.originWarehouseId)).innerJoin(destination, eq(destination.id, t.managementStockTransfers.destinationWarehouseId))
    .where(and(managementPeriod(t.managementStockTransfers.createdAt, period), unitIds ? or(managementUnitScope(origin.healthUnitId, unitIds), managementUnitScope(destination.healthUnitId, unitIds)) : undefined)).orderBy(desc(t.managementStockTransfers.createdAt));
  return rows.map(r => ({ ...r.item, material: r.material, transfer: { ...r.transfer, originWarehouse: r.origin, destinationWarehouse: r.destination } }));
}

export async function readManagementStocks(db: DatabaseExecutor, unitIds: string[] | undefined, restricted: boolean) {
  const rows = await db.select({ stock: getTableColumns(materialStocks), material: getTableColumns(materials), profile: { productKind: healthMaterialProfiles.productKind }, warehouse: getTableColumns(warehouses) }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId))
    .where(and(managementUnitScope(warehouses.healthUnitId, unitIds), eq(healthMaterialProfiles.isActive, true), restricted ? inArray(healthMaterialProfiles.productKind, ["CONTROLLED", "MANIPULATED"]) : undefined)).orderBy(asc(materials.name), asc(materialStocks.expirationDate));
  return rows.map(r => ({ ...r.stock, material: { ...r.material, healthProfile: r.profile }, warehouse: r.warehouse }));
}

export async function readManagementMovements(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  const reversal = alias(materialMovements, "management_reversal");
  const rows = await db.select({ movement: getTableColumns(materialMovements), material: { name: materials.name }, warehouse: { name: warehouses.name }, stock: { batchNumber: materialStocks.batchNumber }, reversal: { id: reversal.id } }).from(materialMovements).innerJoin(materials, eq(materials.id, materialMovements.materialId)).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId)).leftJoin(materialStocks, eq(materialStocks.id, materialMovements.stockId)).leftJoin(reversal, eq(reversal.reversedMovementId, materialMovements.id))
    .where(and(managementPeriod(materialMovements.date, period), managementUnitScope(warehouses.healthUnitId, unitIds), eq(healthMaterialProfiles.isActive, true))).orderBy(desc(materialMovements.date));
  return rows.map(r => ({ ...r.movement, material: r.material, warehouse: r.warehouse, stock: r.stock, reversalMovement: r.reversal }));
}

export async function readManagementTransferDocument(db: DatabaseExecutor, recordId: string) {
  const origin = alias(warehouses, "management_doc_origin"), destination = alias(warehouses, "management_doc_destination"), transfers = t.managementStockTransfers;
  const [row] = await db.select({ transfer: getTableColumns(transfers), origin: { name: origin.name }, destination: { name: destination.name } }).from(transfers).innerJoin(origin, eq(origin.id, transfers.originWarehouseId)).innerJoin(destination, eq(destination.id, transfers.destinationWarehouseId)).where(or(eq(transfers.id, recordId), eq(transfers.requestNumber, recordId))).limit(1);
  if (!row) return null;
  const items = await db.select({ item: getTableColumns(t.managementStockTransferItems), material: { name: materials.name } }).from(t.managementStockTransferItems).innerJoin(materials, eq(materials.id, t.managementStockTransferItems.materialId)).where(eq(t.managementStockTransferItems.transferId, row.transfer.id));
  return { ...row.transfer, originWarehouse: row.origin, destinationWarehouse: row.destination, items: items.map(i => ({ ...i.item, material: i.material })) };
}
