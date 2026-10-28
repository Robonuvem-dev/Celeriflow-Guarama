import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { addresses } from "../../schema/registry";
import { healthPatientConditions } from "../../schema/health-care";
import { healthPregnancies } from "../../schema/health-care-lines";
import { healthCarePrograms, healthCareProgramEnrollments } from "../../schema/health-programs";
import { healthPharmacyKitDeliveries, healthPharmacyKitDeliveryItems, medicineDispensations } from "../../schema/health-pharmacy";
import { pharmacyRecord, readActivePharmacyPatient } from "./records";

export async function readPharmacyKitEligibility(db: DatabaseExecutor, patientId: string) {
  const patient = await readActivePharmacyPatient(db, patientId);
  const [residential, clinicalConditions, pregnancies] = await Promise.all([
    db.select().from(addresses).where(and(eq(addresses.personId, patient.personId), eq(addresses.addressType, "Residencial"), isNull(addresses.canonicalAddressId))).orderBy(desc(addresses.createdAt), desc(addresses.id)).limit(1),
    db.select().from(healthPatientConditions).where(and(eq(healthPatientConditions.patientId, patientId), isNull(healthPatientConditions.endedAt))),
    db.select({ id: healthPregnancies.id }).from(healthPregnancies).where(and(eq(healthPregnancies.patientId, patientId), eq(healthPregnancies.status, "ACTIVE"))),
  ]);
  return { ...patient, person: { ...patient.person, addresses: residential }, clinicalConditions, pregnancies };
}
export async function findPharmacyKitProgramEnrollment(db: DatabaseExecutor, programId: string, patientId: string, unitIds?: string[]) {
  return (await db.select({ id: healthCareProgramEnrollments.id, programId: healthCareProgramEnrollments.programId, unitId: healthCareProgramEnrollments.unitId, startsAt: healthCareProgramEnrollments.startsAt, endsAt: healthCareProgramEnrollments.endsAt }).from(healthCareProgramEnrollments).innerJoin(healthCarePrograms, eq(healthCarePrograms.id, healthCareProgramEnrollments.programId)).where(and(eq(healthCareProgramEnrollments.programId, programId), eq(healthCareProgramEnrollments.patientId, patientId), eq(healthCarePrograms.isActive, true), lte(healthCareProgramEnrollments.startsAt, new Date()), or(isNull(healthCareProgramEnrollments.endsAt), gt(healthCareProgramEnrollments.endsAt, new Date())), unitIds ? inArray(healthCareProgramEnrollments.unitId, unitIds) : undefined)).limit(1))[0] ?? null;
}
export async function readPharmacyKitDelivery(db: DatabaseExecutor, deliveryId: string) {
  const delivery = pharmacyRecord((await db.select().from(healthPharmacyKitDeliveries).where(eq(healthPharmacyKitDeliveries.id, deliveryId)).limit(1))[0]);
  const rows = await db.select({ item: healthPharmacyKitDeliveryItems, dispensation: medicineDispensations }).from(healthPharmacyKitDeliveryItems).leftJoin(medicineDispensations, eq(medicineDispensations.kitDeliveryItemId, healthPharmacyKitDeliveryItems.id)).where(eq(healthPharmacyKitDeliveryItems.deliveryId, deliveryId)).orderBy(asc(healthPharmacyKitDeliveryItems.materialId));
  return { ...delivery, items: rows.map(({ item, dispensation }) => ({ ...item, dispensation })) };
}
