import { and, count, eq, getTableColumns, getTableName, isNull, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { patients, healthPatientRegistrations, healthPatientDocuments } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { employees } from "../../schema/administration";
import { addresses } from "../../schema/registry";
import { healthProfessionals, healthProfessionalAssignments } from "../../schema/health-workforce";
import { healthServiceAssignments, healthHabilitations } from "../../schema/health-administration";
import { healthPregnancies } from "../../schema/health-care-lines";
import { managementUnitScope } from "./common";

export async function lockManagementMergeRecords(tx: DatabaseTransaction, table: typeof patients | typeof addresses | typeof healthProfessionals, ids: string[]) {
  for (const id of [...ids].sort()) await tx.execute(sql`select id from ${table} where id=${id} for update`);
}
export async function readManagementMergePatients(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: patients.id, status: patients.status, person: { fullName: people.fullName, birthDate: people.birthDate, motherName: people.motherName } }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(managementUnitScope(patients.id, ids));
}
export async function readManagementMergeProfessionals(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: healthProfessionals.id, isActive: healthProfessionals.isActive, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(managementUnitScope(healthProfessionals.id, ids));
}
export async function countManagementActivePregnancies(db: DatabaseExecutor, ids: string[]) {
  const [row] = await db.select({ count: count() }).from(healthPregnancies).where(and(managementUnitScope(healthPregnancies.patientId, ids), eq(healthPregnancies.status, "ACTIVE")));
  return row.count;
}

/** Native SQL update for the explicitly enumerated FK tables in this merge.
 * Tables without updatedAt keep their immutable timestamps, as in the source. */
export async function moveManagementMergeLinks(tx: DatabaseTransaction, table: PgTable, column: "patientId" | "professionalId", targetId: string, sourceId: string) {
  const columns = getTableColumns(table), link = columns[column];
  if (!link) throw new Error(`Vínculo ausente em ${getTableName(table)}.`);
  const timestamp = columns.updatedAt ? sql`, "updatedAt"=${new Date()}` : sql``;
  const result = await tx.execute<{ count: number }>(sql`with moved as (update ${table} set ${sql.identifier(column)}=${targetId}${timestamp} where ${link}=${sourceId} returning 1) select count(*)::integer as count from moved`);
  return result.rows[0].count;
}
export async function transferManagementProfessionalAssignments(tx: DatabaseTransaction, targetId: string, sourceId: string) {
  const assignments = await tx.select({ id: healthProfessionalAssignments.id, unitId: healthProfessionalAssignments.unitId, specialtyId: healthProfessionalAssignments.specialtyId }).from(healthProfessionalAssignments).where(eq(healthProfessionalAssignments.professionalId, sourceId));
  for (const link of assignments) {
    const [duplicate] = await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, targetId), eq(healthProfessionalAssignments.unitId, link.unitId), link.specialtyId === null ? isNull(healthProfessionalAssignments.specialtyId) : eq(healthProfessionalAssignments.specialtyId, link.specialtyId))).limit(1);
    await tx.update(healthProfessionalAssignments).set(duplicate ? { isActive: false } : { professionalId: targetId }).where(eq(healthProfessionalAssignments.id, link.id));
  }
  const services = await tx.select().from(healthServiceAssignments).where(eq(healthServiceAssignments.professionalId, sourceId));
  for (const link of services) {
    const [duplicate] = await tx.select({ id: healthServiceAssignments.id }).from(healthServiceAssignments).where(and(eq(healthServiceAssignments.professionalId, targetId), eq(healthServiceAssignments.serviceId, link.serviceId))).limit(1);
    await tx.update(healthServiceAssignments).set(duplicate ? { isActive: false } : { professionalId: targetId }).where(eq(healthServiceAssignments.id, link.id));
  }
  const habilitations = await tx.select().from(healthHabilitations).where(eq(healthHabilitations.professionalId, sourceId));
  for (const link of habilitations) {
    const [duplicate] = await tx.select({ id: healthHabilitations.id }).from(healthHabilitations).where(and(eq(healthHabilitations.professionalId, targetId), eq(healthHabilitations.code, link.code))).limit(1);
    await tx.update(healthHabilitations).set(duplicate ? { isActive: false } : { professionalId: targetId }).where(eq(healthHabilitations.id, link.id));
  }
  return { assignments: assignments.length, services: services.length, habilitations: habilitations.length };
}
export async function transferManagementPatientProfile(tx: DatabaseTransaction, targetId: string, sourceId: string) {
  const [sourceProfile] = await tx.select().from(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, sourceId));
  const [targetProfile] = await tx.select().from(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, targetId));
  if (sourceProfile && !targetProfile) await tx.update(healthPatientRegistrations).set({ patientId: targetId }).where(eq(healthPatientRegistrations.patientId, sourceId));
  const sourceDocuments = await tx.select().from(healthPatientDocuments).where(eq(healthPatientDocuments.patientId, sourceId));
  for (const link of sourceDocuments) {
    const [duplicate] = await tx.select({ id: healthPatientDocuments.id }).from(healthPatientDocuments).where(and(eq(healthPatientDocuments.patientId, targetId), eq(healthPatientDocuments.documentId, link.documentId))).limit(1);
    if (!duplicate) await tx.update(healthPatientDocuments).set({ patientId: targetId }).where(eq(healthPatientDocuments.id, link.id));
  }
  return { sourceProfile: sourceProfile ?? null, sourceDocuments };
}
