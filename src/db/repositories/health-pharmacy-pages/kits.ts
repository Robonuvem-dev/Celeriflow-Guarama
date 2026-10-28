import { and, asc, count, desc, eq, getTableColumns, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyKitSearch, PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { healthPharmacyKits as kits, healthPharmacyKitItems as kitItems, healthPharmacyKitDeliveries as deliveries, healthPharmacyKitDeliveryItems as deliveryItems, healthPharmacyKitEvents as events, medicineDispensations } from "../../schema/health-pharmacy";
import { healthCarePrograms as programs, healthCareProgramEnrollments as enrollments } from "../../schema/health-programs";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { materials, materialStocks, warehouses } from "../../schema/assets-stock";
import { healthUnits } from "../../schema/health-workforce";
import { neighborhoods } from "../../schema/localities";
import { pharmacyAvailableStocks, pharmacyIds, pharmacyPageNumber, pharmacyPatients, pharmacyPeople, pharmacyProducts, pharmacyUnits, pharmacyUnitScope, pharmacyWarehouses } from "./common";
const receiver = alias(people, "pharmacy_kit_receiver");

async function kitCompositions(db: DatabaseExecutor) {
  const rows = await db.select().from(kits).where(eq(kits.isActive, true)).orderBy(asc(kits.name));
  const items = await db.select({ ...getTableColumns(kitItems), material: materials }).from(kitItems).innerJoin(materials, eq(materials.id, kitItems.materialId)).where(pharmacyIds(kitItems.kitId, rows.map(row => row.id)));
  return rows.map(row => ({ ...row, items: items.filter(item => item.kitId === row.id) }));
}
async function programEnrollments(db: DatabaseExecutor, units: PharmacyPageUnits, q?: string) {
  const rows = await db.select({ enrollment: enrollments, program: programs, fullName: people.fullName, unit: { name: healthUnits.name } }).from(enrollments).innerJoin(programs, eq(programs.id, enrollments.programId)).innerJoin(patients, eq(patients.id, enrollments.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, enrollments.unitId)).where(and(pharmacyUnitScope(enrollments.unitId, units), q ? ilike(people.fullName, `%${q}%`) : undefined)).orderBy(desc(enrollments.startsAt)).limit(200);
  return rows.map(row => ({ ...row.enrollment, program: row.program, patient: { person: { fullName: row.fullName } }, unit: row.unit }));
}
export async function readPharmacyKitsPage(db: DatabaseExecutor, unitsScope: PharmacyPageUnits, search: PharmacyKitSearch) {
  const where = and(pharmacyUnitScope(warehouses.healthUnitId, unitsScope), search.deliveryId ? eq(deliveries.id, search.deliveryId) : undefined, search.status ? eq(deliveries.status, search.status) : undefined, search.q ? ilike(people.fullName, `%${search.q}%`) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(deliveries).innerJoin(warehouses, eq(warehouses.id, deliveries.warehouseId)).innerJoin(patients, eq(patients.id, deliveries.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(where);
  const page = pharmacyPageNumber(search.page, total);
  const [kitRows, rows, patientRows, warehouseRows, products, neighborhoodRows, stocks, receiverRows, programRows, enrollmentRows, units] = await Promise.all([
    kitCompositions(db),
    db.select({ delivery: deliveries, kit: kits, patient: patients, person: people, warehouse: warehouses, receiverPerson: receiver }).from(deliveries).innerJoin(kits, eq(kits.id, deliveries.kitId)).innerJoin(patients, eq(patients.id, deliveries.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(warehouses, eq(warehouses.id, deliveries.warehouseId)).leftJoin(receiver, eq(receiver.id, deliveries.receiverPersonId)).where(where).orderBy(desc(deliveries.createdAt)).limit(20).offset((page - 1) * 20),
    pharmacyPatients(db, unitsScope, search.q, 200), pharmacyWarehouses(db, unitsScope), pharmacyProducts(db), db.select({ id: neighborhoods.id, name: neighborhoods.name, city: neighborhoods.city }).from(neighborhoods).where(eq(neighborhoods.status, "Ativo")).orderBy(asc(neighborhoods.name)),
    pharmacyAvailableStocks(db, unitsScope, { activeWarehouse: false }), pharmacyPeople(db, search.receiver || undefined), db.select().from(programs).where(eq(programs.isActive, true)).orderBy(asc(programs.name)), programEnrollments(db, unitsScope, search.q), pharmacyUnits(db, unitsScope),
  ]);
  const ids = rows.map(row => row.delivery.id);
  const [items, eventRows] = await Promise.all([
    db.select({ ...getTableColumns(deliveryItems), material: materials, stock: materialStocks, dispensation: medicineDispensations }).from(deliveryItems).innerJoin(materials, eq(materials.id, deliveryItems.materialId)).leftJoin(materialStocks, eq(materialStocks.id, deliveryItems.stockId)).leftJoin(medicineDispensations, eq(medicineDispensations.kitDeliveryItemId, deliveryItems.id)).where(pharmacyIds(deliveryItems.deliveryId, ids)),
    db.select().from(events).where(pharmacyIds(events.deliveryId, ids)).orderBy(desc(events.createdAt)),
  ]);
  return { total, page, kits: kitRows, deliveries: rows.map(row => ({ ...row.delivery, kit: row.kit, patient: { ...row.patient, person: row.person }, warehouse: row.warehouse, receiverPerson: row.receiverPerson, items: items.filter(item => item.deliveryId === row.delivery.id), events: eventRows.filter(event => event.deliveryId === row.delivery.id) })), patients: patientRows, warehouses: warehouseRows, products, neighborhoods: neighborhoodRows, stocks, people: receiverRows, programs: programRows, enrollments: enrollmentRows, units };
}
