import { and, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";
import { employees } from "../../schema/administration";
import { materials, materialStocks, warehouses, inventorySessions } from "../../schema/assets-stock";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { healthAppointments } from "../../schema/health-agenda";
import { healthProfessionals, healthProfessionalAssignments, healthTeams } from "../../schema/health-workforce";
import { healthMaterialProfiles } from "../../schema/health-pharmacy";
import { vaccines, vaccinationRecords, healthVaccineCodeMappings, healthVaccineLotProfiles, healthVaccineManufacturers, healthVaccineOpenedVials, healthVaccinationCardEvents } from "../../schema/health-vaccination";

export function vaccinationRecord<T>(row: T | undefined): T {
  if (!row) throw new Error("Registro de vacinação não encontrado.");
  return row;
}
export async function readVaccinationPatient(db: DatabaseExecutor, patientId: string, active = false) {
  const row = vaccinationRecord((await db.select({ patient: patients, person: people }).from(patients).innerJoin(people, eq(people.id, patients.personId))
    .where(and(eq(patients.id, patientId), active ? and(eq(patients.status, "Ativo"), eq(people.status, "Ativo"), isNull(people.deathDate)) : undefined)).limit(1))[0]);
  return { ...row.patient, person: row.person };
}
export async function hasVaccinationPatientUnitAccess(db: DatabaseExecutor, patientId: string, unitIds: string[]) {
  if ((await db.select({ id: vaccinationRecords.id }).from(vaccinationRecords).where(and(eq(vaccinationRecords.patientId, patientId), inArray(vaccinationRecords.unitId, unitIds))).limit(1))[0]) return true;
  return Boolean((await db.select({ id: healthAppointments.id }).from(healthAppointments).where(and(eq(healthAppointments.patientId, patientId), inArray(healthAppointments.unitId, unitIds))).limit(1))[0]);
}
export async function findVaccinationProfessional(db: DatabaseExecutor, unitId: string, professionalId: string | null, employeeId: string | null) {
  const [row] = await db.select({ professional: healthProfessionals, employee: employees, team: { name: healthTeams.name, unitId: healthTeams.unitId } }).from(healthProfessionals)
    .innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(healthTeams, eq(healthTeams.id, healthProfessionals.teamId))
    .where(and(professionalId ? eq(healthProfessionals.id, professionalId) : eq(healthProfessionals.employeeId, employeeId || "__SEM_PROFISSIONAL__"), eq(healthProfessionals.isActive, true), eq(employees.isActive, true),
      or(eq(healthProfessionals.unitId, unitId), sql`EXISTS (SELECT 1 FROM ${healthProfessionalAssignments} WHERE ${healthProfessionalAssignments.professionalId}=${healthProfessionals.id} AND ${healthProfessionalAssignments.unitId}=${unitId} AND ${healthProfessionalAssignments.isActive}=true)`))).limit(1);
  return row ? { ...row.professional, employee: row.employee, team: row.team?.unitId === unitId ? row.team : null } : null;
}
export async function readVaccinationVaccine(db: DatabaseExecutor, vaccineId: string, active = false) {
  const row = vaccinationRecord((await db.select({ vaccine: vaccines, material: materials }).from(vaccines).leftJoin(materials, eq(materials.id, vaccines.materialId))
    .where(and(eq(vaccines.id, vaccineId), active ? eq(vaccines.isActive, true) : undefined)).limit(1))[0]);
  return { ...row.vaccine, material: row.material };
}
export async function readVaccinationCodeMappings(db: DatabaseExecutor, vaccineId: string) {
  return db.select().from(healthVaccineCodeMappings).where(eq(healthVaccineCodeMappings.vaccineId, vaccineId)).orderBy(desc(healthVaccineCodeMappings.createdAt));
}
export async function readVaccinationStock(db: DatabaseExecutor, stockId: string) {
  const row = vaccinationRecord((await db.select({ stock: materialStocks, material: materials, vaccine: vaccines, profile: healthVaccineLotProfiles, healthProfile: healthMaterialProfiles, warehouse: warehouses }).from(materialStocks)
    .innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId))
    .leftJoin(vaccines, eq(vaccines.materialId, materials.id)).leftJoin(healthVaccineLotProfiles, eq(healthVaccineLotProfiles.stockId, materialStocks.id)).leftJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id))
    .where(eq(materialStocks.id, stockId)).limit(1))[0]);
  const manufacturer = row.profile?.manufacturerId ? (await db.select().from(healthVaccineManufacturers).where(eq(healthVaccineManufacturers.id, row.profile.manufacturerId)).limit(1))[0] ?? null : null;
  return { ...row.stock, warehouse: row.warehouse, material: { ...row.material, vaccine: row.vaccine, healthProfile: row.healthProfile }, vaccineLotProfile: row.profile ? { ...row.profile, manufacturer } : null };
}
export async function readVaccinationStockIdentity(db: DatabaseExecutor, stockId: string) {
  return vaccinationRecord((await db.select({ warehouseId: materialStocks.warehouseId }).from(materialStocks).where(eq(materialStocks.id, stockId)).limit(1))[0]);
}
export async function vaccinationInventoryOpen(db: DatabaseExecutor, warehouseId: string) {
  return Boolean((await db.select({ id: inventorySessions.id }).from(inventorySessions).where(and(eq(inventorySessions.warehouseId, warehouseId), eq(inventorySessions.lockMovements, true), inArray(inventorySessions.status, ["COUNTING", "PENDING_APPROVAL"]))).limit(1))[0]);
}
export async function allocatedVaccinationDoses(db: DatabaseExecutor, stockId: string, exceptVialId?: string) {
  // SUM(int4) is int8 text on Neon. Decode exactly before the legacy Float boundary.
  const [row] = await db.select({ remaining: sql<string>`coalesce(sum(${healthVaccineOpenedVials.remainingDoses}), 0)::text` }).from(healthVaccineOpenedVials)
    .where(and(eq(healthVaccineOpenedVials.stockId, stockId), exceptVialId ? ne(healthVaccineOpenedVials.id, exceptVialId) : undefined));
  return new Decimal(row.remaining).toNumber();
}
export async function findVaccinationReplay(db: DatabaseExecutor, key: string) {
  const [row] = await db.select({ record: vaccinationRecords, stock: { warehouseId: materialStocks.warehouseId } }).from(vaccinationRecords).leftJoin(materialStocks, eq(materialStocks.id, vaccinationRecords.stockId)).where(eq(vaccinationRecords.idempotencyKey, key)).limit(1);
  return row ? { ...row.record, stock: row.stock } : null;
}
export async function findVaccinationIndication(db: DatabaseExecutor, patientId: string, vaccineId: string, doseNumber: number, at: Date, eventId?: string | null) {
  const query = db.select({ id: healthVaccinationCardEvents.id }).from(healthVaccinationCardEvents).where(and(eq(healthVaccinationCardEvents.patientId, patientId), eq(healthVaccinationCardEvents.vaccineId, vaccineId), eq(healthVaccinationCardEvents.kind, "INDICATION"), eq(healthVaccinationCardEvents.doseNumber, doseNumber), isNull(healthVaccinationCardEvents.revokedAt), lte(healthVaccinationCardEvents.occurredAt, at),
    sql`NOT EXISTS (SELECT 1 FROM ${vaccinationRecords} WHERE ${vaccinationRecords.indicationEventId}=${healthVaccinationCardEvents.id})`, eventId ? eq(healthVaccinationCardEvents.id, eventId) : undefined));
  const row = (await (eventId ? query : query.orderBy(desc(healthVaccinationCardEvents.createdAt))).limit(1))[0];
  return eventId ? vaccinationRecord(row).id : row?.id ?? null;
}
export async function findAvailableVaccinationVials(db: DatabaseExecutor, stockId: string, vaccineId: string, at: Date, vialId?: string | null) {
  return db.select().from(healthVaccineOpenedVials).where(and(eq(healthVaccineOpenedVials.stockId, stockId), eq(healthVaccineOpenedVials.vaccineId, vaccineId), gt(healthVaccineOpenedVials.remainingDoses, 0), lte(healthVaccineOpenedVials.openedAt, at), or(isNull(healthVaccineOpenedVials.expiresAt), gte(healthVaccineOpenedVials.expiresAt, at)), vialId ? eq(healthVaccineOpenedVials.id, vialId) : undefined)).orderBy(healthVaccineOpenedVials.openedAt).limit(2);
}
