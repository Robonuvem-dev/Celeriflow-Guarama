import { and, asc, count, desc, eq, getTableColumns, ilike, isNotNull, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { JsonValue } from "../../json";
import type { PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { materials, materialStocks, warehouses, materialCategories } from "../../schema/assets-stock";
import { healthMaterialProfiles, medicineDispensations } from "../../schema/health-pharmacy";
import { healthPrescriptions, healthPrescriptionItems, medicines } from "../../schema/health-prescriptions";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { suppliers, companies } from "../../schema/registry";
import { instanceParameters } from "../../schema/instance-configuration";
import { managementStockReceipts as receipts, managementStockReceiptItems as receiptItems, managementStockTransfers as transfers } from "../../schema/health-management-operations";
import { pharmacyPageReceiptDetails, pharmacyPageReceiptItemDetails } from "../../schema/health-pharmacy-pages";
import { pharmacyIds, pharmacyPatients, pharmacyProducts, pharmacyUnits, pharmacyUnitScope, pharmacyWarehouses, pharmacyWarehouseScope } from "./common";

const origin = alias(warehouses, "pharmacy_page_origin"), destination = alias(warehouses, "pharmacy_page_destination");
const receiptDetails = alias(pharmacyPageReceiptDetails, "pharmacy_receipt_details"), itemDetails = alias(pharmacyPageReceiptItemDetails, "pharmacy_receipt_item_details");

async function stockPrescriptions(db: DatabaseExecutor, units: PharmacyPageUnits) {
  const rows = await db.select({ item: healthPrescriptionItems, prescription: healthPrescriptions, patient: patients, person: people }).from(healthPrescriptionItems)
    .innerJoin(medicines, eq(medicines.id, healthPrescriptionItems.medicineId)).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId))
    .innerJoin(patients, eq(patients.id, healthPrescriptions.patientId)).innerJoin(people, eq(people.id, patients.personId))
    .where(and(isNotNull(medicines.materialId), pharmacyUnitScope(healthPrescriptions.unitId, units))).orderBy(desc(healthPrescriptionItems.createdAt)).limit(200);
  const dispensations = await db.select().from(medicineDispensations).where(and(pharmacyIds(medicineDispensations.prescriptionItemId, rows.map(row => row.item.id)), eq(medicineDispensations.status, "ACTIVE")));
  return rows.map(row => ({ ...row.item, prescription: { ...row.prescription, patient: { ...row.patient, person: row.person } }, dispensations: dispensations.filter(d => d.prescriptionItemId === row.item.id) }));
}
async function stockReceipts(db: DatabaseExecutor, units: PharmacyPageUnits) {
  const rows = await db.select({ ...getTableColumns(receipts), entryType: receiptDetails.entryType, donorName: receiptDetails.donorName, warehouse: { name: warehouses.name } }).from(receipts)
    .innerJoin(receiptDetails, eq(receiptDetails.id, receipts.id)).innerJoin(warehouses, eq(warehouses.id, receipts.warehouseId)).where(pharmacyWarehouseScope(warehouses.healthUnitId, units)).orderBy(desc(receipts.receivedAt)).limit(30);
  const items = await db.select({ ...getTableColumns(receiptItems), expirationDate: itemDetails.expirationDate, manufacturerName: itemDetails.manufacturerName, material: { name: materials.name } }).from(receiptItems)
    .innerJoin(itemDetails, eq(itemDetails.id, receiptItems.id)).innerJoin(materials, eq(materials.id, receiptItems.materialId)).where(pharmacyIds(receiptItems.receiptId, rows.map(row => row.id)));
  return rows.map(row => ({ ...row, items: items.filter(item => item.receiptId === row.id) }));
}
export async function readPharmacyStockPage(db: DatabaseExecutor, unitsScope: PharmacyPageUnits, search: { q: string; filter: string; requestedPage: number }) {
  const base = and(eq(healthMaterialProfiles.isActive, true), pharmacyWarehouseScope(warehouses.healthUnitId, unitsScope));
  const where = and(base, search.filter ? eq(warehouses.name, search.filter) : undefined, search.q ? or(ilike(materials.name, `%${search.q}%`), ilike(warehouses.name, `%${search.q}%`), ilike(materialStocks.batchNumber, `%${search.q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(where);
  const page = Math.min(search.requestedPage, Math.max(1, Math.ceil(total / 20)));
  const stockQuery = (filtered: boolean) => db.select({ stock: materialStocks, material: materials, warehouse: warehouses }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(filtered ? where : base).orderBy(sql`${materialStocks.expirationDate} ASC NULLS LAST`, desc(materialStocks.createdAt)).limit(filtered ? 20 : 500).offset(filtered ? (page - 1) * 20 : 0);
  const [stockRows, optionRows, warehouseRows, products, supplierRows, prescriptions, transferRows, categories, units, medicineRows, patientRows, receiptRows, approvalPolicies] = await Promise.all([
    stockQuery(true), stockQuery(false), pharmacyWarehouses(db, unitsScope, true), pharmacyProducts(db),
    db.select({ id: suppliers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(eq(suppliers.status, "Ativo")).limit(200),
    stockPrescriptions(db, unitsScope),
    db.select({ ...getTableColumns(transfers), originWarehouse: origin, destinationWarehouse: destination }).from(transfers).innerJoin(origin, eq(origin.id, transfers.originWarehouseId)).innerJoin(destination, eq(destination.id, transfers.destinationWarehouseId)).where(and(eq(transfers.status, "IN_TRANSIT"), unitsScope === undefined ? undefined : or(pharmacyIds(origin.healthUnitId, unitsScope), pharmacyIds(destination.healthUnitId, unitsScope)))).orderBy(desc(transfers.createdAt)),
    db.select().from(materialCategories).where(eq(materialCategories.isActive, true)).orderBy(asc(materialCategories.name)), pharmacyUnits(db, unitsScope, true),
    db.select().from(medicines).where(and(eq(medicines.isActive, true), isNotNull(medicines.materialId))).orderBy(asc(medicines.name)), pharmacyPatients(db, unitsScope, undefined, 500), stockReceipts(db, unitsScope),
    db.select({ chave: instanceParameters.chave, valor: sql<JsonValue>`${instanceParameters.valor}` }).from(instanceParameters).where(like(instanceParameters.chave, "HEALTH_STOCK_RECEIPT_APPROVAL:%")),
  ]);
  return { total, page, stocks: stockRows.map(row => ({ ...row.stock, material: row.material, warehouse: row.warehouse })), stockOptions: optionRows.map(row => ({ ...row.stock, material: row.material, warehouse: row.warehouse })), warehouses: warehouseRows, materials: products, suppliers: supplierRows, prescriptions, transfers: transferRows, categories, units, medicines: medicineRows, patients: patientRows, receipts: receiptRows, approvalPolicies };
}

export async function readPharmacyInvoicesPage(db: DatabaseExecutor, units: PharmacyPageUnits) {
  const [warehouseRows, products, supplierRows] = await Promise.all([
    pharmacyWarehouses(db, units, true),
    db.select({ id: materials.id, name: materials.name, unitOfMeasure: materials.unitOfMeasure }).from(materials).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).where(and(eq(materials.isActive, true), eq(healthMaterialProfiles.isActive, true))).orderBy(asc(materials.name)),
    db.select({ ...getTableColumns(suppliers), company: companies }).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(suppliers.status, "Ativo"), isNotNull(suppliers.companyId))),
  ]);
  return { warehouses: warehouseRows, products, suppliers: supplierRows };
}
