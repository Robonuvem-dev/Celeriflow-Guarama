import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { materials, materialStocks, warehouses } from "../../schema/assets-stock";
import { people } from "../../schema/people";
import { patients } from "../../schema/health-registration";
import { medicines, healthPrescriptions, healthPrescriptionItems } from "../../schema/health-prescriptions";
import { healthMaterialProfiles, medicineDispensations, pharmacyRequestFulfillments } from "../../schema/health-pharmacy";

export function pharmacyRecord<T>(row: T | undefined): T {
  if (!row) throw new Error("Registro farmacêutico não encontrado.");
  return row;
}

export async function readPharmacyWarehouse(db: DatabaseExecutor, warehouseId: string) {
  return pharmacyRecord((await db.select().from(warehouses).where(and(eq(warehouses.id, warehouseId), eq(warehouses.isActive, true))).limit(1))[0]);
}
export async function readActivePharmacyPatient(db: DatabaseExecutor, patientId: string) {
  const row = pharmacyRecord((await db.select({ patient: patients, person: people }).from(patients).innerJoin(people, eq(people.id, patients.personId))
    .where(and(eq(patients.id, patientId), eq(patients.status, "Ativo"), eq(people.status, "Ativo"), isNull(people.deathDate))).limit(1))[0]);
  return { ...row.patient, person: row.person };
}
export async function readPharmacyPatientPerson(db: DatabaseExecutor, patientId: string) {
  return pharmacyRecord((await db.select({ personId: patients.personId }).from(patients).where(eq(patients.id, patientId)).limit(1))[0]);
}
export async function isActivePharmacyPerson(db: DatabaseExecutor, personId: string) {
  return Boolean((await db.select({ id: people.id }).from(people).where(and(eq(people.id, personId), eq(people.status, "Ativo"))).limit(1))[0]);
}
export async function countActivePharmacyMaterials(db: DatabaseExecutor, ids: string[]) {
  const rows = await db.select({ id: materials.id }).from(materials).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id))
    .where(and(inArray(materials.id, ids), eq(materials.isActive, true), eq(healthMaterialProfiles.isActive, true)));
  return rows.length;
}
export async function readPharmacyStock(db: DatabaseExecutor, stockId: string) {
  const row = pharmacyRecord((await db.select({ stock: materialStocks, material: materials, medicine: medicines, healthProfile: healthMaterialProfiles }).from(materialStocks)
    .innerJoin(materials, eq(materials.id, materialStocks.materialId)).leftJoin(medicines, eq(medicines.materialId, materials.id)).leftJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id))
    .where(eq(materialStocks.id, stockId)).limit(1))[0]);
  return { ...row.stock, material: { ...row.material, medicine: row.medicine, healthProfile: row.healthProfile } };
}
export async function findPharmacyDispensingStock(db: DatabaseExecutor, warehouseId: string, materialId: string, quantity: number, batchNumber?: string | null) {
  const query = db.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, warehouseId), eq(materialStocks.materialId, materialId),
    batchNumber != null ? eq(materialStocks.batchNumber, batchNumber) : and(gte(materialStocks.quantity, quantity), isNull(materialStocks.blockedAt), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date())))));
  return (await (batchNumber != null ? query : query.orderBy(asc(materialStocks.expirationDate), asc(materialStocks.createdAt))).limit(1))[0] ?? null;
}
export async function readPharmacyPrescriptionItem(db: DatabaseExecutor, id: string) {
  const row = pharmacyRecord((await db.select({ item: healthPrescriptionItems, prescription: healthPrescriptions, medicine: medicines }).from(healthPrescriptionItems)
    .innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).leftJoin(medicines, eq(medicines.id, healthPrescriptionItems.medicineId)).where(eq(healthPrescriptionItems.id, id)).limit(1))[0]);
  const dispensations = await db.select({ quantity: medicineDispensations.quantity }).from(medicineDispensations).where(and(eq(medicineDispensations.prescriptionItemId, id), eq(medicineDispensations.status, "ACTIVE")));
  return { ...row.item, prescription: row.prescription, medicine: row.medicine, dispensations };
}
export async function findPharmacyDispensationReplay(db: DatabaseExecutor, idempotencyKey: string) {
  const row = (await db.select({ dispensation: medicineDispensations, fulfillment: { requestItemId: pharmacyRequestFulfillments.requestItemId }, stock: materialStocks }).from(medicineDispensations)
    .leftJoin(pharmacyRequestFulfillments, eq(pharmacyRequestFulfillments.dispensationId, medicineDispensations.id)).leftJoin(materialStocks, eq(materialStocks.id, medicineDispensations.stockId))
    .where(eq(medicineDispensations.idempotencyKey, idempotencyKey)).limit(1))[0];
  return row ? { ...row.dispensation, pharmacyRequestFulfillment: row.fulfillment, stock: row.stock } : null;
}
export async function readPharmacyDispensation(db: DatabaseExecutor, id: string) {
  const row = pharmacyRecord((await db.select({ dispensation: medicineDispensations, fulfillment: { requestItemId: pharmacyRequestFulfillments.requestItemId } }).from(medicineDispensations)
    .leftJoin(pharmacyRequestFulfillments, eq(pharmacyRequestFulfillments.dispensationId, medicineDispensations.id)).where(eq(medicineDispensations.id, id)).limit(1))[0]);
  return { ...row.dispensation, pharmacyRequestFulfillment: row.fulfillment };
}
export async function readPharmacyMaterial(db: DatabaseExecutor, materialId: string) {
  const row = pharmacyRecord((await db.select({ material: materials, medicine: medicines, healthProfile: healthMaterialProfiles }).from(materials)
    .innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).leftJoin(medicines, eq(medicines.materialId, materials.id))
    .where(and(eq(materials.id, materialId), eq(materials.isActive, true), eq(healthMaterialProfiles.isActive, true))).limit(1))[0]);
  return { ...row.material, medicine: row.medicine, healthProfile: row.healthProfile };
}
export async function listPharmacyPrescriptionCandidates(db: DatabaseExecutor, medicineId: string, patientId: string, unitIds: string[] | undefined, through: Date | null) {
  const reference = new Date(Math.max(Date.now(), through?.valueOf() || 0));
  const items = await db.select({ item: healthPrescriptionItems }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId))
    .where(and(eq(healthPrescriptionItems.medicineId, medicineId), eq(healthPrescriptions.patientId, patientId), unitIds ? inArray(healthPrescriptions.unitId, unitIds) : undefined,
      through ? gte(healthPrescriptions.validUntil, reference) : or(isNull(healthPrescriptions.validUntil), gte(healthPrescriptions.validUntil, reference))))
    .orderBy(desc(healthPrescriptions.date));
  const ids = items.map(row => row.item.id);
  const deliveries = await db.select({ prescriptionItemId: medicineDispensations.prescriptionItemId, quantity: medicineDispensations.quantity }).from(medicineDispensations)
    .where(and(inArray(medicineDispensations.prescriptionItemId, ids), eq(medicineDispensations.status, "ACTIVE")));
  return items.map(({ item }) => ({ ...item, dispensations: deliveries.filter(row => row.prescriptionItemId === item.id) }));
}
