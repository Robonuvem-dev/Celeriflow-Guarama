import { and, asc, count, desc, eq, getTableColumns, isNotNull, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";
import { healthAppointments as appointments, healthCareSchedules as schedules, healthWaitlists as waitlists, healthTriages as triages } from "../../schema/health-agenda";
import { medicalRecords, healthPerformedProcedures, healthExamRequests } from "../../schema/health-care";
import { healthProductionFacts } from "../../schema/health-production";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { healthUnits, healthProfessionals, healthProfessionalAssignments } from "../../schema/health-workforce";
import { healthSpecialties } from "../../schema/health-administration";
import { employees } from "../../schema/administration";
import { addresses } from "../../schema/registry";
import { neighborhoods } from "../../schema/localities";
import { healthSusProcedures, healthSusReferences } from "../../schema/health-catalogs";
import { auditEvents } from "../../schema/audit";
import { users } from "../../schema/identity";
import { managementContains, managementPeriod, managementUnitScope } from "./common";

export async function readManagementFirstAddress(db: DatabaseExecutor, personId: string) {
  return db.select({ neighborhood: { city: neighborhoods.city, state: neighborhoods.state } }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).where(eq(addresses.personId, personId)).orderBy(asc(addresses.createdAt)).limit(1);
}

export async function readManagementPatients(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; birthdays?: boolean; recordId?: string }) {
  const query = db.select({ patient: getTableColumns(patients), person: getTableColumns(people), unit: { name: healthUnits.name } }).from(patients).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthUnits, eq(healthUnits.id, patients.referenceUnitId))
    .where(options.recordId ? or(eq(patients.id, options.recordId), eq(patients.cns, options.recordId)) : and(managementUnitScope(patients.referenceUnitId, options.unitIds), options.birthdays ? and(eq(patients.status, "Ativo"), isNotNull(people.birthDate)) : managementPeriod(patients.createdAt, options.period)))
    .orderBy(...(options.recordId || options.birthdays ? [] : [desc(patients.createdAt)])).limit(options.recordId ? 1 : 2000);
  return (await query).map(r => ({ ...r.patient, person: r.person, referenceUnit: r.unit }));
}

export async function readManagementAppointments(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; professionalId?: string; specialtyId?: string; assignmentSpecialtyId?: string; status?: string; limit?: number; ascending?: boolean; unordered?: boolean; primaryAddress?: boolean; recordId?: string }) {
  const query = db.select({ appointment: getTableColumns(appointments), person: getTableColumns(people), unit: { name: healthUnits.name }, professional: getTableColumns(healthProfessionals), employee: { name: employees.name }, specialty: { name: healthSpecialties.name } }).from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, appointments.unitId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, appointments.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, appointments.specialtyId))
    .where(and(options.recordId ? eq(appointments.id, options.recordId) : undefined, managementPeriod(appointments.date, options.period), managementUnitScope(appointments.unitId, options.unitIds), options.professionalId ? eq(appointments.professionalId, options.professionalId) : undefined, options.specialtyId ? eq(appointments.specialtyId, options.specialtyId) : undefined, options.status ? eq(appointments.status, options.status) : undefined,
      options.assignmentSpecialtyId ? sql`exists (select 1 from ${healthProfessionalAssignments} where ${healthProfessionalAssignments.professionalId}=${appointments.professionalId} and ${healthProfessionalAssignments.specialtyId}=${options.assignmentSpecialtyId})` : undefined))
    .orderBy(...(options.unordered || options.recordId ? [] : options.ascending ? [asc(appointments.date), asc(appointments.id)] : [desc(appointments.date)])).$dynamic();
  const rows = await (options.recordId ? query.limit(1) : options.limit !== undefined ? query.limit(options.limit) : query);
  return Promise.all(rows.map(async r => ({ ...r.appointment, patient: { person: { ...r.person, addresses: options.primaryAddress ? await readManagementFirstAddress(db, r.person.id) : [] } }, unit: r.unit, professional: r.professional && r.employee ? { ...r.professional, employee: r.employee } : null, specialtyRef: r.specialty })));
}

export async function readManagementWaitlists(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod, specialtyId?: string) {
  const rows = await db.select({ wait: getTableColumns(waitlists), person: { fullName: people.fullName }, specialty: { name: healthSpecialties.name }, schedule: { id: schedules.id }, unit: { name: healthUnits.name } }).from(waitlists).innerJoin(patients, eq(patients.id, waitlists.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, waitlists.specialtyId)).leftJoin(schedules, eq(schedules.id, waitlists.scheduleId)).leftJoin(healthUnits, eq(healthUnits.id, schedules.unitId))
    .where(and(managementPeriod(waitlists.createdAt, period), specialtyId ? eq(waitlists.specialtyId, specialtyId) : undefined, unitIds ? or(managementUnitScope(schedules.unitId, unitIds), managementUnitScope(patients.referenceUnitId, unitIds)) : undefined)).orderBy(desc(waitlists.createdAt)).limit(2000);
  return rows.map(r => ({ ...r.wait, patient: { person: r.person }, specialty: r.specialty, schedule: r.schedule && r.unit ? { unit: r.unit } : null }));
}

export async function readManagementAgendaStatistics(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  return Promise.all([
    db.select({ status: schedules.status, _count: count() }).from(schedules).where(managementUnitScope(schedules.unitId, unitIds)).groupBy(schedules.status),
    db.select({ status: appointments.status, _count: count() }).from(appointments).where(and(managementPeriod(appointments.date, period), managementUnitScope(appointments.unitId, unitIds))).groupBy(appointments.status),
    db.select({ status: waitlists.status, _count: count() }).from(waitlists).innerJoin(patients, eq(patients.id, waitlists.patientId)).leftJoin(schedules, eq(schedules.id, waitlists.scheduleId)).where(unitIds ? or(managementUnitScope(schedules.unitId, unitIds), managementUnitScope(patients.referenceUnitId, unitIds)) : undefined).groupBy(waitlists.status),
  ]);
}

export async function readManagementSchedules(db: DatabaseExecutor, unitIds: string[] | undefined, kind: string) {
  const rows = await db.select({ schedule: getTableColumns(schedules), unit: { name: healthUnits.name }, specialty: { name: healthSpecialties.name }, professional: { id: healthProfessionals.id }, employee: { name: employees.name } }).from(schedules).innerJoin(healthUnits, eq(healthUnits.id, schedules.unitId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, schedules.specialtyId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, schedules.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(eq(schedules.kind, kind), managementUnitScope(schedules.unitId, unitIds))).orderBy(asc(schedules.date), asc(schedules.weekday)).limit(2000);
  const occupied = rows.length ? await db.select({ id: appointments.id, scheduleId: appointments.scheduleId }).from(appointments).where(and(managementUnitScope(appointments.scheduleId, rows.map(r => r.schedule.id)), sql`${appointments.status}=ANY(${sql.param(["Agendado", "Confirmado", "Aguardando", "Em Atendimento"])}::text[])`)) : [];
  return rows.map(r => ({ ...r.schedule, unit: r.unit, specialty: r.specialty, professional: r.professional && r.employee ? { employee: r.employee } : null, appointments: occupied.filter(a => a.scheduleId === r.schedule.id).map(a => ({ id: a.id })) }));
}

export async function readManagementAudits(db: DatabaseExecutor, period: HealthManagementPeriod, targetType?: string) {
  const rows = await db.select({ event: getTableColumns(auditEvents), actor: { nome: users.nome } }).from(auditEvents).innerJoin(users, eq(users.id, auditEvents.actorUsuarioId)).where(and(managementPeriod(auditEvents.createdAt, period), targetType ? eq(auditEvents.targetType, targetType) : undefined)).orderBy(desc(auditEvents.createdAt)).limit(2000);
  return rows.map(r => ({ ...r.event, actorUsuario: r.actor }));
}

export async function readManagementTriages(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod, professionalId?: string) {
  const rows = await db.select({ triage: getTableColumns(triages), person: { fullName: people.fullName }, unit: { name: healthUnits.name }, employee: { name: employees.name } }).from(triages).innerJoin(appointments, eq(appointments.id, triages.appointmentId)).innerJoin(patients, eq(patients.id, appointments.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, appointments.unitId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, triages.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(managementPeriod(triages.createdAt, period), managementUnitScope(appointments.unitId, unitIds), professionalId ? eq(triages.professionalId, professionalId) : undefined)).orderBy(desc(triages.createdAt)).limit(2000);
  return rows.map(r => ({ ...r.triage, professional: { employee: r.employee }, appointment: { unit: r.unit, patient: { person: r.person } } }));
}

export async function countManagementTriages(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  const [row] = await db.select({ count: count() }).from(triages).innerJoin(appointments, eq(appointments.id, triages.appointmentId)).where(and(managementPeriod(triages.createdAt, period), managementUnitScope(appointments.unitId, unitIds)));
  return row.count;
}

export async function readManagementMedicalRecords(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; professionalId?: string; completed?: boolean; limit?: number; ascending?: boolean; unordered?: boolean; primaryAddress?: boolean; recordId?: string }) {
  const query = db.select({ record: getTableColumns(medicalRecords), person: getTableColumns(people), unit: { name: healthUnits.name }, employee: { name: employees.name }, appointment: { municipalitySnapshot: appointments.municipalitySnapshot, stateSnapshot: appointments.stateSnapshot } }).from(medicalRecords).innerJoin(patients, eq(patients.id, medicalRecords.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, medicalRecords.unitId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, medicalRecords.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(appointments, eq(appointments.id, medicalRecords.appointmentId))
    .where(and(managementPeriod(medicalRecords.date, options.period), managementUnitScope(medicalRecords.unitId, options.unitIds), options.professionalId ? eq(medicalRecords.professionalId, options.professionalId) : undefined, options.completed ? isNotNull(medicalRecords.completedAt) : undefined, options.recordId ? eq(medicalRecords.id, options.recordId) : undefined))
    .orderBy(...(options.unordered || options.recordId ? [] : options.ascending ? [asc(medicalRecords.date), asc(medicalRecords.id)] : [desc(medicalRecords.date)])).$dynamic();
  const rows = await (options.recordId ? query.limit(1) : options.limit !== undefined ? query.limit(options.limit) : query);
  return Promise.all(rows.map(async r => ({ ...r.record, patient: { person: { ...r.person, addresses: options.primaryAddress ? await readManagementFirstAddress(db, r.person.id) : [] } }, unit: r.unit, professional: { employee: r.employee }, appointment: r.appointment })));
}

export async function readManagementPerformedProcedures(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; professionalId?: string; limit: number; unordered?: boolean }) {
  const rows = await db.select({ performed: getTableColumns(healthPerformedProcedures), procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description }, employee: { name: employees.name }, person: { fullName: people.fullName }, unit: { name: healthUnits.name } }).from(healthPerformedProcedures).innerJoin(healthSusProcedures, eq(healthSusProcedures.id, healthPerformedProcedures.procedureId)).innerJoin(medicalRecords, eq(medicalRecords.id, healthPerformedProcedures.medicalRecordId)).innerJoin(patients, eq(patients.id, medicalRecords.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, medicalRecords.unitId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, healthPerformedProcedures.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(managementPeriod(healthPerformedProcedures.performedAt, options.period), managementUnitScope(medicalRecords.unitId, options.unitIds), options.professionalId ? eq(healthPerformedProcedures.professionalId, options.professionalId) : undefined)).orderBy(...(options.unordered ? [] : [desc(healthPerformedProcedures.performedAt)])).limit(options.limit);
  return rows.map(r => ({ ...r.performed, procedure: r.procedure, professional: { employee: r.employee }, medicalRecord: { unit: r.unit, patient: { person: r.person } } }));
}

export async function readManagementExamRequests(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod, professionalId?: string) {
  const rows = await db.select({ request: getTableColumns(healthExamRequests), employee: { name: employees.name } }).from(healthExamRequests).innerJoin(healthProfessionals, eq(healthProfessionals.id, healthExamRequests.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(managementPeriod(healthExamRequests.date, period), managementUnitScope(healthExamRequests.unitId, unitIds), professionalId ? eq(healthExamRequests.professionalId, professionalId) : undefined)).orderBy(desc(healthExamRequests.date)).limit(2000);
  return rows.map(r => ({ ...r.request, professional: { employee: r.employee } }));
}

export async function readManagementProductionFacts(db: DatabaseExecutor, options: { unitIds?: string[]; professionalId?: string; procedure?: string; cid?: string; municipality?: string; status?: string; limit: number }) {
  // The historical production statistics intentionally have no date predicate.
  const rows = await db.select({ fact: getTableColumns(healthProductionFacts), procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description, financing: healthSusProcedures.financing }, professional: { cbo: healthProfessionals.cbo }, employee: { name: employees.name }, unit: { name: healthUnits.name }, cid: { code: healthSusReferences.code }, patient: { id: patients.id }, person: { gender: people.gender, birthDate: people.birthDate } }).from(healthProductionFacts)
    .leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthProductionFacts.procedureId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthProductionFacts.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(healthUnits, eq(healthUnits.id, healthProductionFacts.unitId)).leftJoin(healthSusReferences, eq(healthSusReferences.id, healthProductionFacts.cidReferenceId)).leftJoin(patients, eq(patients.id, healthProductionFacts.patientId)).leftJoin(people, eq(people.id, patients.personId))
    .where(and(managementUnitScope(healthProductionFacts.unitId, options.unitIds), options.professionalId ? eq(healthProductionFacts.professionalId, options.professionalId) : undefined, options.procedure ? or(managementContains(healthSusProcedures.code, options.procedure), managementContains(healthSusProcedures.description, options.procedure)) : undefined, managementContains(healthSusReferences.code, options.cid), managementContains(healthProductionFacts.municipality, options.municipality), options.status ? eq(healthProductionFacts.status, options.status) : undefined)).orderBy(desc(healthProductionFacts.occurredAt)).limit(options.limit);
  return rows.map(r => ({ ...r.fact, procedure: r.procedure, professional: r.professional && r.employee ? { ...r.professional, employee: r.employee } : null, unit: r.unit, cidReference: r.cid, patient: r.patient && r.person ? { person: r.person } : null }));
}
