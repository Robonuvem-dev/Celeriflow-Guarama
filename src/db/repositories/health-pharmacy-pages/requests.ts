import { and, count, desc, eq, getTableColumns, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyPageUnits, PharmacyRequestSearch } from "../../../lib/contracts/health-pharmacy-pages";
import { pharmacyRequests as requests, pharmacyRequestItems as items, pharmacyRequestEvents as events, pharmacyRequestFulfillments as fulfillments, pharmacyStockTransferItems as transferLinks } from "../../schema/health-pharmacy";
import { managementStockTransfers as transfers, managementStockTransferItems as transferItems } from "../../schema/health-management-operations";
import { warehouses, materials, materialMovements as movements, materialStocks } from "../../schema/assets-stock";
import { medicines } from "../../schema/health-prescriptions";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { pharmacyAvailableStocks, pharmacyIds, pharmacyPageNumber, pharmacyPatients, pharmacyPeople, pharmacyPrescriptionOptions, pharmacyProducts, pharmacyProfessionals, pharmacyWarehouses, pharmacyWarehouseScope } from "./common";
const origin = alias(warehouses, "pharmacy_request_origin"), destination = alias(warehouses, "pharmacy_request_destination"), receiver = alias(people, "pharmacy_request_receiver");

export async function readPharmacyRequestsPage(db: DatabaseExecutor, units: PharmacyPageUnits, search: PharmacyRequestSearch) {
  const where = and(pharmacyWarehouseScope(destination.healthUnitId, units), search.materialId ? sql`EXISTS (SELECT 1 FROM ${items} WHERE ${items.requestId} = ${requests.id} AND ${items.materialId} = ${search.materialId})` : undefined,
    search.status ? eq(requests.status, search.status) : undefined, search.type === "PATIENT" ? isNotNull(requests.patientId) : search.type === "WAREHOUSE" ? isNull(requests.patientId) : undefined,
    search.q ? or(ilike(people.fullName, `%${search.q}%`), ilike(requests.notes, `%${search.q}%`), sql`EXISTS (SELECT 1 FROM ${items} JOIN ${materials} ON ${materials.id} = ${items.materialId} WHERE ${items.requestId} = ${requests.id} AND ${materials.name} ILIKE ${`%${search.q}%`})`) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(requests).innerJoin(destination, eq(destination.id, requests.destinationWarehouseId)).leftJoin(patients, eq(patients.id, requests.patientId)).leftJoin(people, eq(people.id, patients.personId)).where(where);
  const page = pharmacyPageNumber(search.page, total);
  const [rows, warehouseRows, products, patientRows, stocks, prescriptions, professionals, receiverRows] = await Promise.all([
    db.select({ request: requests, patient: patients, person: people, destinationWarehouse: destination, originWarehouse: origin }).from(requests).innerJoin(destination, eq(destination.id, requests.destinationWarehouseId)).leftJoin(origin, eq(origin.id, requests.originWarehouseId)).leftJoin(patients, eq(patients.id, requests.patientId)).leftJoin(people, eq(people.id, patients.personId)).where(where).orderBy(desc(requests.requestedAt)).limit(20).offset((page - 1) * 20),
    pharmacyWarehouses(db, units), pharmacyProducts(db), pharmacyPatients(db, units, search.patient, 200), pharmacyAvailableStocks(db, units, { activeWarehouse: true, product: "PROFILE", ordered: true, materialId: search.materialId }), pharmacyPrescriptionOptions(db, units), pharmacyProfessionals(db), pharmacyPeople(db, search.receiver || undefined),
  ]);
  const ids = rows.map(row => row.request.id);
  const [itemRows, eventRows] = await Promise.all([
    db.select({ item: items, material: materials, medicine: medicines }).from(items).innerJoin(materials, eq(materials.id, items.materialId)).leftJoin(medicines, eq(medicines.materialId, materials.id)).where(pharmacyIds(items.requestId, ids)),
    db.select().from(events).where(pharmacyIds(events.requestId, ids)).orderBy(desc(events.createdAt)),
  ]);
  const itemIds = itemRows.map(row => row.item.id);
  const [transferRows, fulfillmentRows] = await Promise.all([
    db.select({ ...getTableColumns(transferItems), pharmacyRequestItemId: transferLinks.pharmacyRequestItemId, transfer: transfers, originWarehouse: origin, destinationWarehouse: destination }).from(transferItems).innerJoin(transferLinks, eq(transferLinks.id, transferItems.id)).innerJoin(transfers, eq(transfers.id, transferItems.transferId)).innerJoin(origin, eq(origin.id, transfers.originWarehouseId)).innerJoin(destination, eq(destination.id, transfers.destinationWarehouseId)).where(pharmacyIds(transferLinks.pharmacyRequestItemId, itemIds)),
    db.select({ fulfillment: fulfillments, movement: movements, stock: materialStocks, receiverPerson: receiver }).from(fulfillments).innerJoin(movements, eq(movements.id, fulfillments.movementId)).leftJoin(materialStocks, eq(materialStocks.id, movements.stockId)).leftJoin(receiver, eq(receiver.id, fulfillments.receiverPersonId)).where(pharmacyIds(fulfillments.requestItemId, itemIds)),
  ]);
  return { total, page, requests: rows.map(row => ({ ...row.request, patient: row.patient && row.person ? { ...row.patient, person: row.person } : null, destinationWarehouse: row.destinationWarehouse, originWarehouse: row.originWarehouse,
    items: itemRows.filter(item => item.item.requestId === row.request.id).map(item => ({ ...item.item, material: { ...item.material, medicine: item.medicine }, transfers: transferRows.filter(t => t.pharmacyRequestItemId === item.item.id).map(t => ({ ...t, transfer: { ...t.transfer, originWarehouse: t.originWarehouse, destinationWarehouse: t.destinationWarehouse } })), fulfillments: fulfillmentRows.filter(f => f.fulfillment.requestItemId === item.item.id).map(f => ({ ...f.fulfillment, movement: { ...f.movement, stock: f.stock }, receiverPerson: f.receiverPerson })) })), events: eventRows.filter(event => event.requestId === row.request.id) })), warehouses: warehouseRows, products, patients: patientRows, stocks, prescriptions, professionals, people: receiverRows };
}
