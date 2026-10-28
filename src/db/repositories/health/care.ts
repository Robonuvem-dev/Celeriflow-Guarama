import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { medicalRecords, healthObservations } from "@/db/schema/health-care";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { healthAppointments, healthTriages } from "@/db/schema/health-agenda";

export async function findHealthCareRecord(database: DatabaseExecutor, medicalRecordId: string) {
  const [row] = await database.select({ record: medicalRecords, patient: patients, person: people, unit: healthUnits, professional: healthProfessionals, employee: { name: employees.name }, appointment: healthAppointments, triage: healthTriages, observation: healthObservations })
    .from(medicalRecords)
    .innerJoin(patients, eq(patients.id, medicalRecords.patientId))
    .innerJoin(people, eq(people.id, patients.personId))
    .innerJoin(healthUnits, eq(healthUnits.id, medicalRecords.unitId))
    .innerJoin(healthProfessionals, eq(healthProfessionals.id, medicalRecords.professionalId))
    .innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .leftJoin(healthAppointments, eq(healthAppointments.id, medicalRecords.appointmentId))
    .leftJoin(healthTriages, eq(healthTriages.appointmentId, healthAppointments.id))
    .leftJoin(healthObservations, eq(healthObservations.medicalRecordId, medicalRecords.id))
    .where(eq(medicalRecords.id, medicalRecordId)).limit(1);
  return row ? { ...row.record, patient: { ...row.patient, person: row.person }, unit: row.unit, professional: { ...row.professional, employee: row.employee }, appointment: row.appointment ? { ...row.appointment, triage: row.triage } : null, observation: row.observation } : null;
}
