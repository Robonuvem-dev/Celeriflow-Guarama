import { and, count, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyDispensationHistory, PharmacyDispensationSearch, PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { healthPrescriptions as prescriptions, healthPrescriptionItems as items, medicines } from "../../schema/health-prescriptions";
import { medicineDispensations as dispensations, healthDispensationEvents as events, healthPharmacyKitDeliveryItems as kitItems } from "../../schema/health-pharmacy";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { healthUnits } from "../../schema/health-workforce";
import { materialStocks } from "../../schema/assets-stock";
import { pharmacyAvailableStocks, pharmacyIds, pharmacyPageNumber, pharmacyPatients, pharmacyPeople, pharmacyProfessionals, pharmacyUnits, pharmacyUnitScope } from "./common";
const receiver = alias(people, "pharmacy_dispensation_receiver");

async function selectedPrescriptions(db: DatabaseExecutor, units: PharmacyPageUnits, search: PharmacyDispensationSearch) {
  const scope = search.unitId ? eq(prescriptions.unitId, search.unitId) : pharmacyUnitScope(prescriptions.unitId, units);
  const rows = await db.select({ prescription: prescriptions, patient: patients, person: people }).from(prescriptions).innerJoin(patients, eq(patients.id, prescriptions.patientId)).innerJoin(people, eq(people.id, patients.personId))
    .where(and(scope, search.patientId ? eq(prescriptions.patientId, search.patientId) : undefined,
      search.barcode ? or(ilike(prescriptions.barcode, search.barcode.trim()), ilike(prescriptions.id, search.barcode.trim())) : search.patientId ? undefined : eq(prescriptions.id, "__SELECIONE_PACIENTE_OU_RECEITA__"))).orderBy(desc(prescriptions.date)).limit(100);
  const itemRows = await db.select({ item: items, medicine: medicines }).from(items).leftJoin(medicines, eq(medicines.id, items.medicineId)).where(pharmacyIds(items.prescriptionId, rows.map(row => row.prescription.id)));
  const active = await db.select({ prescriptionItemId: dispensations.prescriptionItemId, quantity: dispensations.quantity }).from(dispensations).where(and(pharmacyIds(dispensations.prescriptionItemId, itemRows.map(row => row.item.id)), eq(dispensations.status, "ACTIVE")));
  return rows.map(row => ({ ...row.prescription, patient: { ...row.patient, person: row.person }, items: itemRows.filter(item => item.item.prescriptionId === row.prescription.id).map(item => ({ ...item.item, medicine: item.medicine, dispensations: active.filter(d => d.prescriptionItemId === item.item.id).map(d => ({ quantity: d.quantity })) })) }));
}
export async function readPharmacyDispensationsPage(db: DatabaseExecutor, unitsScope: PharmacyPageUnits, search: PharmacyDispensationSearch, dates: { from?: Date; to?: Date }) {
  const prescriptionRows = await selectedPrescriptions(db, unitsScope, search);
  const patientId = search.patientId || prescriptionRows[0]?.patientId;
  const where = and(search.unitId ? eq(dispensations.unitId, search.unitId) : pharmacyUnitScope(dispensations.unitId, unitsScope), patientId ? eq(dispensations.patientId, patientId) : undefined,
    search.status === "ALL" ? undefined : eq(dispensations.status, search.status === "CANCELLED" ? "CANCELLED" : "ACTIVE"), dates.from ? gte(dispensations.date, dates.from) : undefined, dates.to ? lt(dispensations.date, dates.to) : undefined, search.q ? ilike(people.fullName, `%${search.q.trim()}%`) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(dispensations).innerJoin(patients, eq(patients.id, dispensations.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(where);
  const page = pharmacyPageNumber(search.page, total);
  const [rows, patientRows, stocks, units, professionals, receiverRows] = await Promise.all([
    db.select({ dispensation: dispensations, patient: patients, person: people, medicine: medicines, stock: materialStocks, unit: healthUnits, receiverPerson: receiver, kitDeliveryItem: { deliveryId: kitItems.deliveryId } }).from(dispensations).innerJoin(patients, eq(patients.id, dispensations.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(medicines, eq(medicines.id, dispensations.medicineId)).innerJoin(healthUnits, eq(healthUnits.id, dispensations.unitId)).leftJoin(materialStocks, eq(materialStocks.id, dispensations.stockId)).leftJoin(receiver, eq(receiver.id, dispensations.receiverPersonId)).leftJoin(kitItems, eq(kitItems.id, dispensations.kitDeliveryItemId)).where(where).orderBy(desc(dispensations.date), desc(dispensations.id)).limit(20).offset((page - 1) * 20),
    pharmacyPatients(db, unitsScope, search.q ? search.q.trim() : undefined, 200), pharmacyAvailableStocks(db, unitsScope, { activeWarehouse: true, product: "MEDICINE", ordered: true }), pharmacyUnits(db, unitsScope), pharmacyProfessionals(db, false, true), pharmacyPeople(db, search.receiverQ ? search.receiverQ.trim() : undefined, true),
  ]);
  const eventRows = await db.select().from(events).where(pharmacyIds(events.dispensationId, rows.map(row => row.dispensation.id))).orderBy(desc(events.createdAt));
  const history = rows.map(row => ({ ...row.dispensation, patient: { ...row.patient, person: row.person }, medicine: row.medicine, stock: row.stock, unit: row.unit, receiverPerson: row.receiverPerson, kitDeliveryItem: row.kitDeliveryItem, events: eventRows.filter(event => event.dispensationId === row.dispensation.id) })) satisfies PharmacyDispensationHistory[];
  return { prescriptions: prescriptionRows, patientId, total, page, dispensations: history, patients: patientRows, stocks, units, professionals, people: receiverRows };
}
