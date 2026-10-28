import { z } from "zod";
import { and, asc, eq, getTableColumns, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { healthDiagnoses, healthPerformedProcedures, medicalRecords } from "@/db/schema/health-care";
import { healthSusProcedures, healthSusReferences } from "@/db/schema/health-catalogs";
import { healthHomeCareAssessments, healthHomeCareAttendances, healthHomeCareRequests } from "@/db/schema/health-territory";
import type { HealthDiagnosticsContext as AppContext } from "@/lib/contracts/health-diagnostics";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";

export async function getHealthRaasSources(context: AppContext, raw: unknown, executor: DatabaseExecutor = db) {
  const input = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), unitId: z.string().max(200).default(""), modality: z.enum(["ALL", "DOMICILIAR", "PSICOSSOCIAL"]).default("ALL") }).strict().parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  const units = input.unitId ? [input.unitId] : context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [year, month] = input.period.split("-").map(Number);
  const period = { gte: new Date(`${input.period}-01T00:00:00-03:00`), lt: new Date(`${new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)}T00:00:00-03:00`) };
  const homeRows = input.modality === "PSICOSSOCIAL" ? [] : await executor.select({ attendance: getTableColumns(healthHomeCareAttendances), assessment: getTableColumns(healthHomeCareAssessments), request: { patientId: healthHomeCareRequests.patientId, unitId: healthHomeCareRequests.unitId, requestedAt: healthHomeCareRequests.requestedAt, reason: healthHomeCareRequests.reason } }).from(healthHomeCareAttendances)
    .innerJoin(healthHomeCareAssessments, eq(healthHomeCareAssessments.id, healthHomeCareAttendances.assessmentId))
    .innerJoin(healthHomeCareRequests, eq(healthHomeCareRequests.id, healthHomeCareAttendances.requestId))
    .where(and(gte(healthHomeCareAttendances.performedAt, period.gte), lt(healthHomeCareAttendances.performedAt, period.lt), units ? inArray(healthHomeCareRequests.unitId, units) : undefined)).orderBy(asc(healthHomeCareAttendances.performedAt));
  const home = homeRows.map(({ attendance, assessment, request }) => ({ ...attendance, assessment, request }));
  const homeByRecord = new Map(home.map(item => [item.medicalRecordId, item]));
  const recordRows = await executor.select({ record: getTableColumns(medicalRecords), patient: { cns: patients.cns }, person: { fullName: people.fullName, birthDate: people.birthDate, gender: people.gender }, unit: { id: healthUnits.id, name: healthUnits.name, cnes: healthUnits.cnes, type: healthUnits.type }, professional: { id: healthProfessionals.id, cns: healthProfessionals.cns, cbo: healthProfessionals.cbo }, employee: { name: employees.name } }).from(medicalRecords)
    .innerJoin(patients, eq(patients.id, medicalRecords.patientId)).innerJoin(people, eq(people.id, patients.personId))
    .innerJoin(healthUnits, eq(healthUnits.id, medicalRecords.unitId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, medicalRecords.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(units ? inArray(medicalRecords.unitId, units) : undefined, isNotNull(medicalRecords.completedAt), or(
      home.length ? inArray(medicalRecords.id, home.map(item => item.medicalRecordId)) : undefined,
      input.modality !== "DOMICILIAR" ? and(gte(medicalRecords.date, period.gte), lt(medicalRecords.date, period.lt), sql`lower(${healthUnits.type}) = 'caps'`) : undefined,
    ) ?? sql`false`)).orderBy(asc(medicalRecords.date), asc(medicalRecords.id));
  const recordIds = recordRows.map(row => row.record.id);
  const [diagnoses, procedures] = recordIds.length ? await Promise.all([
    executor.select({ medicalRecordId: healthDiagnoses.medicalRecordId, isPrimary: healthDiagnoses.isPrimary, cidReference: { code: healthSusReferences.code, description: healthSusReferences.description } }).from(healthDiagnoses).innerJoin(healthSusReferences, eq(healthSusReferences.id, healthDiagnoses.cidReferenceId)).where(inArray(healthDiagnoses.medicalRecordId, recordIds)),
    executor.select({ id: healthPerformedProcedures.id, medicalRecordId: healthPerformedProcedures.medicalRecordId, quantity: healthPerformedProcedures.quantity, performedAt: healthPerformedProcedures.performedAt, professionalId: healthPerformedProcedures.professionalId, procedure: { id: healthSusProcedures.id, code: healthSusProcedures.code, description: healthSusProcedures.description } }).from(healthPerformedProcedures).innerJoin(healthSusProcedures, eq(healthSusProcedures.id, healthPerformedProcedures.procedureId)).where(inArray(healthPerformedProcedures.medicalRecordId, recordIds)),
  ]) : [[], []];
  const records = recordRows.map(({ record, patient, person, unit, professional, employee }) => ({ ...record, patient: { ...patient, person }, unit, professional: { ...professional, employee }, diagnoses: diagnoses.filter(item => item.medicalRecordId === record.id), procedures: procedures.filter(item => item.medicalRecordId === record.id) }));
  const origins = records.map(record => {
    const attendance = homeByRecord.get(record.id), modality = attendance ? "DOMICILIAR" : "PSICOSSOCIAL";
    const criticisms: string[] = [];
    if (!record.patient.cns) criticisms.push("SEM_CNS_PACIENTE");
    if (!record.patient.person.birthDate) criticisms.push("SEM_NASCIMENTO");
    if (!record.unit.cnes) criticisms.push("SEM_CNES_UNIDADE");
    if (!record.professional.cns) criticisms.push("SEM_CNS_PROFISSIONAL");
    if (!record.professional.cbo) criticisms.push("SEM_CBO_PROFISSIONAL");
    if (!record.diagnoses.length) criticisms.push("SEM_DIAGNOSTICO_CID");
    if (!record.procedures.length) criticisms.push("SEM_PROCEDIMENTO_REALIZADO");
    if (attendance && (attendance.request.patientId !== record.patientId || attendance.request.unitId !== record.unitId || !attendance.assessment.eligible)) criticisms.push("ORIGEM_DOMICILIAR_INCONSISTENTE");
    return { originType: attendance ? "HOME_CARE_ATTENDANCE" : "CAPS_MEDICAL_RECORD", originId: attendance?.id || record.id, medicalRecordId: record.id, modality, occurredAt: record.date.toISOString(), completedAt: record.completedAt!.toISOString(), outcome: record.outcome, patient: { id: record.patientId, name: record.patient.person.fullName, cns: record.patient.cns, birthDate: record.patient.person.birthDate?.toISOString() || null, gender: record.patient.person.gender }, unit: record.unit, professional: { id: record.professional.id, name: record.professional.employee.name, cns: record.professional.cns, cbo: record.professional.cbo }, diagnoses: record.diagnoses.map(diagnosis => ({ code: diagnosis.cidReference.code, description: diagnosis.cidReference.description, principal: diagnosis.isPrimary })), procedures: record.procedures.map(item => ({ id: item.id, procedureId: item.procedure.id, code: item.procedure.code, description: item.procedure.description, quantity: item.quantity, performedAt: item.performedAt.toISOString(), professionalId: item.professionalId })), homeCare: attendance ? { requestId: attendance.requestId, assessmentId: attendance.assessmentId, assessmentDate: attendance.assessment.assessedAt.toISOString(), modality: attendance.assessment.modality, character: attendance.assessment.character, requestedAt: attendance.request.requestedAt.toISOString(), indication: attendance.request.reason } : null, criticisms };
  });
  const found = new Set(records.map(record => record.id));
  const missingOrigins = home.filter(item => !found.has(item.medicalRecordId)).map(item => ({ originType: "HOME_CARE_ATTENDANCE", originId: item.id, medicalRecordId: item.medicalRecordId, criticism: "PRONTUARIO_CONCLUIDO_NAO_LOCALIZADO_NO_ESCOPO" }));
  return { contract: "CELERIFLOW_RAAS_ORIGINS", version: "1.0.0", period: input.period, origins, missingOrigins };
}
