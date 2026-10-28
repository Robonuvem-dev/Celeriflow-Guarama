import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { employees, institutions } from "../../schema/administration";
import { healthProfessionals, healthUnits } from "../../schema/health-workforce";
import { vaccines, vaccinationRecords, healthVaccinationCardEvents, healthVaccineCalendarRules } from "../../schema/health-vaccination";
import { vaccinationRecord } from "./records";

export async function listCurrentVaccinationRules(db: DatabaseExecutor, at: Date, ordered = false) {
  const query = db.select({ rule: healthVaccineCalendarRules, vaccine: vaccines }).from(healthVaccineCalendarRules).innerJoin(vaccines, eq(vaccines.id, healthVaccineCalendarRules.vaccineId))
    .where(and(eq(healthVaccineCalendarRules.enabled, true), lte(healthVaccineCalendarRules.validFrom, at), or(isNull(healthVaccineCalendarRules.validUntil), gte(healthVaccineCalendarRules.validUntil, at)), eq(vaccines.isActive, true)));
  const rows = await (ordered ? query.orderBy(asc(vaccines.name), asc(healthVaccineCalendarRules.doseNumber)) : query);
  return rows.map(({ rule, vaccine }) => ({ ...rule, vaccine }));
}
export async function readVaccinationCardRecords(db: DatabaseExecutor, patientId: string, at: Date, unitIds?: string[]) {
  const indicationProfessionals = alias(healthProfessionals, "vaccination_indication_professional");
  const indicationEmployees = alias(employees, "vaccination_indication_employee");
  const rows = await db.select({ record: vaccinationRecords, vaccine: vaccines, professional: healthProfessionals, employee: employees, unit: healthUnits,
    indication: healthVaccinationCardEvents, indicationProfessional: indicationProfessionals, indicationEmployee: indicationEmployees }).from(vaccinationRecords)
    .innerJoin(vaccines, eq(vaccines.id, vaccinationRecords.vaccineId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, vaccinationRecords.professionalId))
    .innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).innerJoin(healthUnits, eq(healthUnits.id, vaccinationRecords.unitId))
    .leftJoin(healthVaccinationCardEvents, eq(healthVaccinationCardEvents.id, vaccinationRecords.indicationEventId))
    .leftJoin(indicationProfessionals, eq(indicationProfessionals.id, healthVaccinationCardEvents.professionalId)).leftJoin(indicationEmployees, eq(indicationEmployees.id, indicationProfessionals.employeeId))
    .where(and(eq(vaccinationRecords.patientId, patientId), lte(vaccinationRecords.date, at), unitIds ? inArray(vaccinationRecords.unitId, unitIds) : undefined)).orderBy(desc(vaccinationRecords.date));
  return rows.map(row => ({ ...row.record, vaccine: row.vaccine, unit: row.unit, professional: { ...row.professional, employee: row.employee },
    indicationEvent: row.indication ? { ...row.indication, professional: { ...vaccinationRecord(row.indicationProfessional ?? undefined), employee: vaccinationRecord(row.indicationEmployee ?? undefined) } } : null }));
}
export async function readVaccinationCardEvents(db: DatabaseExecutor, patientId: string, at: Date, unitIds?: string[]) {
  const rows = await db.select({ event: healthVaccinationCardEvents, vaccine: vaccines, professional: healthProfessionals, employee: employees }).from(healthVaccinationCardEvents)
    .innerJoin(vaccines, eq(vaccines.id, healthVaccinationCardEvents.vaccineId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, healthVaccinationCardEvents.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(eq(healthVaccinationCardEvents.patientId, patientId), lte(healthVaccinationCardEvents.occurredAt, at), unitIds ? inArray(healthVaccinationCardEvents.unitId, unitIds) : undefined)).orderBy(desc(healthVaccinationCardEvents.createdAt));
  return rows.map(({ event, vaccine, professional, employee }) => ({ ...event, vaccine, professional: { ...professional, employee } }));
}
export async function readVaccinationDocumentHeader(db: DatabaseExecutor, referenceUnitId: string | null) {
  const [institutionRows, units] = await Promise.all([db.select({ name: institutions.name, cnpj: institutions.cnpj }).from(institutions).limit(1), referenceUnitId ? db.select({ name: healthUnits.name }).from(healthUnits).where(eq(healthUnits.id, referenceUnitId)).limit(1) : []]);
  return { institution: institutionRows[0] ?? null, unit: units[0] ?? null };
}
