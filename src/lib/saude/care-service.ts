import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthDatabaseConnection } from "./health-transaction";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { healthProfessionals, healthProfessionalAssignments } from "@/db/schema/health-workforce";
import { healthAppointments, healthAppointmentEvents, healthCareSchedules, healthTriages } from "@/db/schema/health-agenda";
import { medicalRecords, healthObservations, healthClinicalEvolutions, healthDiagnoses, healthExamRequests, healthPerformedProcedures, healthReferrals, healthSpecialtyProcedureRules, healthClinicalDocuments } from "@/db/schema/health-care";
import { healthSusProcedures, healthSusReferences } from "@/db/schema/health-catalogs";
import { healthLabExamModels, healthLabOrders } from "@/db/schema/health-laboratory";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { HealthOperationError, runHealthTransaction } from "./appointment-service";
import { assertHealthAppointmentCanBeCompleted, assertHealthAppointmentCanBeCompletedAt } from "./appointment-policy";
import { clinicalEvolutionSchema, concludeCareSchema, diagnosisInputSchema, examRequestInputSchema, medicalRecordNarrativeSchema, performedProcedureInputSchema, prescriptionInputSchema, referralInputSchema } from "./care-contract";
import { uploadFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { syncRegulationAppointment } from "./regulation-agenda-service";
import { prescribeClinicalLineTx } from "./prescription-service";
import { assertRequiredClinicalQuestionnaires } from "./clinical-extension-service";
import { captureCareIndicatorContext } from "./indicator-context";

type Tx = DatabaseExecutor;

async function currentProfessional(tx: Tx, context: AppContext) {
  if (!context.user.employeeId) throw new HealthOperationError("Vincule o usuário autenticado a um profissional de saúde.");
  const [professional] = await tx.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1);
  if (!professional) throw new HealthOperationError("Profissional de saúde ativo não encontrado.");
  const assignments = await tx.select({ unitId: healthProfessionalAssignments.unitId }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.isActive, true)));
  return { ...professional, assignments };
}

async function activeRecord(tx: Tx, context: AppContext, medicalRecordId: string, observationEvolution = false) {
  await tx.execute(sql`SELECT id FROM "MedicalRecord" WHERE id=${medicalRecordId} FOR UPDATE`);
  const [row] = await tx.select({ record: medicalRecords, observation: healthObservations }).from(medicalRecords).leftJoin(healthObservations, eq(healthObservations.medicalRecordId, medicalRecords.id)).where(eq(medicalRecords.id, medicalRecordId)).limit(1);
  if (!row) throw new HealthOperationError("Prontuário de atendimento não encontrado.");
  const record = { ...row.record, observation: row.observation };
  assertHealthUnitAccess(context.user, record.unitId);
  if (record.completedAt && !(observationEvolution && record.observation?.status === "Em observação")) throw new HealthOperationError("O atendimento concluído está disponível somente para consulta.");
  const professional = await currentProfessional(tx, context);
  if (record.professionalId !== professional.id) throw new HealthOperationError("O prontuário pertence a outro profissional de saúde.");
  return record;
}

export async function startHealthCare(context: AppContext, appointmentId: string) {
  return runHealthTransaction(context, async tx => {
    const professional = await currentProfessional(tx, context);
    await tx.execute(sql`SELECT id FROM "HealthAppointment" WHERE id=${appointmentId} FOR UPDATE`);
    const [row] = await tx.select({ appointment: healthAppointments, schedule: healthCareSchedules, medicalRecord: { id: medicalRecords.id }, triage: healthTriages }).from(healthAppointments).leftJoin(healthCareSchedules, eq(healthCareSchedules.id, healthAppointments.scheduleId)).leftJoin(medicalRecords, eq(medicalRecords.appointmentId, healthAppointments.id)).leftJoin(healthTriages, eq(healthTriages.appointmentId, healthAppointments.id)).where(eq(healthAppointments.id, appointmentId)).limit(1);
    if (!row) throw new HealthOperationError("Atendimento não encontrado.");
    const appointment = { ...row.appointment, schedule: row.schedule, medicalRecord: row.medicalRecord, triage: row.triage };
    assertHealthUnitAccess(context.user, appointment.unitId);
    if (professional.unitId !== appointment.unitId && !professional.assignments.some(item => item.unitId === appointment.unitId)) throw new HealthOperationError("O profissional autenticado não possui vínculo ativo com a unidade do atendimento.");
    if (appointment.professionalId && appointment.professionalId !== professional.id) throw new HealthOperationError("O atendimento pertence a outro profissional.");
    if (appointment.medicalRecord) return appointment.medicalRecord;
    if (appointment.schedule?.requirePresenceConfirmation && !appointment.confirmedAt) throw new HealthOperationError("Confirme a presença exigida pela agenda antes de iniciar o atendimento.");
    assertHealthAppointmentCanBeCompleted(appointment.status);
    if (!["Aguardando", "Em Atendimento"].includes(appointment.status)) throw new HealthOperationError("Registre a chegada do paciente antes de iniciar o atendimento.");
    if (appointment.origin === "SCHEDULED") assertHealthAppointmentCanBeCompletedAt(appointment.date);
    const careContextSnapshot = await captureCareIndicatorContext(tx, professional.id, appointment.unitId);
    const [record] = await tx.insert(medicalRecords).values({ type: "Consulta", patientId: appointment.patientId, unitId: appointment.unitId, professionalId: professional.id, appointmentId: appointment.id, careContextSnapshot, bloodPressure: appointment.triage?.bloodPressure, temperature: appointment.triage?.temperature, weight: appointment.triage?.weight, height: appointment.triage?.height, heartRate: appointment.triage?.heartRate, respiratoryRate: appointment.triage?.respiratoryRate, oxygenSaturation: appointment.triage?.oxygenSaturation, bloodGlucose: appointment.triage?.bloodGlucose, chiefComplaint: appointment.triage?.chiefComplaint }).returning({ id: medicalRecords.id });
    await tx.update(healthAppointments).set({ status: "Em Atendimento", startedAt: new Date(), professionalId: professional.id }).where(eq(healthAppointments.id, appointment.id));
    await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: "CARE_STARTED", fromStatus: appointment.status, toStatus: "Em Atendimento", actorUsuarioId: context.user.id });
    return record;
  });
}

export async function saveMedicalRecordNarrative(context: AppContext, raw: unknown) {
  const input = medicalRecordNarrativeSchema.parse(raw);
  return runHealthTransaction(context, async tx => { await activeRecord(tx, context, input.medicalRecordId); const [record] = await tx.update(medicalRecords).set({ anamnesis: input.anamnesis, assessment: input.assessment, evolution: input.evolution, conduct: input.conduct, observations: input.observations }).where(eq(medicalRecords.id, input.medicalRecordId)).returning({ id: medicalRecords.id }); return record; });
}

export async function addClinicalEvolution(context: AppContext, raw: unknown) {
  const input = clinicalEvolutionSchema.parse(raw);
  return runHealthTransaction(context, async tx => { const record = await activeRecord(tx, context, input.medicalRecordId, true); const professional = await currentProfessional(tx, context); const [evolution] = await tx.insert(healthClinicalEvolutions).values({ medicalRecordId: record.id, professionalId: professional.id, content: input.content }).returning({ id: healthClinicalEvolutions.id }); return evolution; });
}

export async function addHealthDiagnosis(context: AppContext, raw: unknown) {
  const input = diagnosisInputSchema.parse(raw);
  return runHealthTransaction(context, async tx => {
    await activeRecord(tx, context, input.medicalRecordId);
    const [cid] = await tx.select({ id: healthSusReferences.id }).from(healthSusReferences).where(and(eq(healthSusReferences.id, input.cidReferenceId), eq(healthSusReferences.kind, "CID"), eq(healthSusReferences.isActive, true), eq(healthSusReferences.isCurrent, true))).limit(1);
    if (!cid) throw new HealthOperationError("CID ativo não encontrado.");
    if (input.isPrimary) await tx.update(healthDiagnoses).set({ isPrimary: false }).where(eq(healthDiagnoses.medicalRecordId, input.medicalRecordId));
    const [diagnosis] = await tx.insert(healthDiagnoses).values(input).onConflictDoUpdate({ target: [healthDiagnoses.medicalRecordId, healthDiagnoses.cidReferenceId], set: { isPrimary: input.isPrimary, notes: input.notes } }).returning({ id: healthDiagnoses.id });
    return diagnosis;
  });
}

export async function addHealthPrescription(context: AppContext, raw: unknown) {
  const input = prescriptionInputSchema.parse(raw);
  return runHealthTransaction(context, tx => prescribeClinicalLineTx(tx, context, input.medicalRecordId, input));
}

export async function addHealthExamRequest(context: AppContext, raw: unknown) {
  const input = examRequestInputSchema.parse(raw);
  return runHealthTransaction(context, async tx => {
    const record = await activeRecord(tx, context, input.medicalRecordId);
    const professional = await currentProfessional(tx, context);
    if (input.procedureId && !(await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1)).length) throw new HealthOperationError("Procedimento de exame não encontrado.");
    const [request] = await tx.insert(healthExamRequests).values({ patientId: record.patientId, professionalId: professional.id, unitId: record.unitId, medicalRecordId: record.id, procedureId: input.procedureId, examName: input.examName, reason: input.indication, indication: input.indication, priority: input.priority, notes: input.notes }).returning({ id: healthExamRequests.id });
    const examModel = input.procedureId ? (await tx.select({ id: healthLabExamModels.id }).from(healthLabExamModels).where(and(eq(healthLabExamModels.procedureId, input.procedureId), eq(healthLabExamModels.isActive, true))).limit(1))[0] : null;
    await tx.insert(healthLabOrders).values({ examRequestId: request.id, examModelId: examModel?.id, patientId: record.patientId, requestUnitId: record.unitId, priority: input.priority.toUpperCase(), idempotencyKey: `exam-request:${request.id}`, createdByUsuarioId: context.user.id });
    return request;
  });
}

export async function addPerformedProcedure(context: AppContext, raw: unknown) {
  const input = performedProcedureInputSchema.parse(raw);
  return runHealthTransaction(context, async tx => { const record = await activeRecord(tx, context, input.medicalRecordId); const professional = await currentProfessional(tx, context); if (!(await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1)).length) throw new HealthOperationError("Procedimento ativo não encontrado."); const [procedure] = await tx.insert(healthPerformedProcedures).values({ medicalRecordId: record.id, procedureId: input.procedureId, professionalId: professional.id, quantity: input.quantity, notes: input.notes }).returning({ id: healthPerformedProcedures.id }); return procedure; });
}

export async function addHealthReferral(context: AppContext, raw: unknown) {
  const input = referralInputSchema.parse(raw);
  return runHealthTransaction(context, async tx => {
    const record = await activeRecord(tx, context, input.medicalRecordId);
    const professional = await currentProfessional(tx, context);
    const [referral] = await tx.insert(healthReferrals).values({ patientId: record.patientId, professionalId: professional.id, medicalRecordId: record.id, specialtyId: input.specialtyId, serviceId: input.serviceId, destinationUnitId: input.destinationUnitId, specialty: input.specialty, priority: input.priority, reason: input.reason, observation: input.observation }).returning();
    const { createFromReferralTx } = await import("./regulation-service");
    await createFromReferralTx(tx, { id: referral.id, patientId: referral.patientId, specialtyId: referral.specialtyId, serviceId: referral.serviceId, destinationUnitId: referral.destinationUnitId, professionalId: referral.professionalId, priority: referral.priority, reason: referral.reason }, context.user.id);
    return { id: referral.id };
  });
}

export async function concludeHealthCare(context: AppContext, raw: unknown) {
  const input = concludeCareSchema.parse(raw);
  return runHealthTransaction(context, async tx => {
    const record = await activeRecord(tx, context, input.medicalRecordId);
    const professional = await currentProfessional(tx, context);
    if (record.professionalId !== professional.id) throw new HealthOperationError("Somente o profissional responsável pode concluir o atendimento.");
    await assertRequiredClinicalQuestionnaires(tx, record.id);
    const now = new Date();
    if (input.outcome === "Observação") await tx.insert(healthObservations).values({ medicalRecordId: record.id, patientId: record.patientId, unitId: record.unitId, admittedAt: now, createdByUsuarioId: context.user.id });
    await tx.update(medicalRecords).set({ outcome: input.outcome, conduct: input.conduct, completedAt: now }).where(eq(medicalRecords.id, record.id));
    const appointment = record.appointmentId ? (await tx.select({ specialtyId: healthAppointments.specialtyId }).from(healthAppointments).where(eq(healthAppointments.id, record.appointmentId)).limit(1))[0] : null;
    const dental = (await tx.execute(sql`SELECT id FROM "HealthDentalMark" WHERE "medicalRecordId"=${record.id} LIMIT 1`)).rows.length > 0;
    const rules = await tx.select().from(healthSpecialtyProcedureRules).where(and(eq(healthSpecialtyProcedureRules.isActive, true), inArray(healthSpecialtyProcedureRules.eventType, dental ? ["CARE_COMPLETED", "DENTAL_COMPLETED"] : ["CARE_COMPLETED"]), or(isNull(healthSpecialtyProcedureRules.unitId), eq(healthSpecialtyProcedureRules.unitId, record.unitId)), or(isNull(healthSpecialtyProcedureRules.specialtyId), eq(healthSpecialtyProcedureRules.specialtyId, appointment?.specialtyId || "__SEM_ESPECIALIDADE__"))));
    for (const rule of rules) if (!(await tx.select({ id: healthPerformedProcedures.id }).from(healthPerformedProcedures).where(and(eq(healthPerformedProcedures.medicalRecordId, record.id), eq(healthPerformedProcedures.procedureId, rule.procedureId))).limit(1)).length) await tx.insert(healthPerformedProcedures).values({ medicalRecordId: record.id, professionalId: professional.id, procedureId: rule.procedureId, quantity: rule.quantity, performedAt: now, notes: "Gerado pelo ato de conclusão do atendimento" });
    if (input.outcome === "Óbito") { const [patient] = await tx.update(patients).set({ status: "Falecido" }).where(eq(patients.id, record.patientId)).returning({ personId: patients.personId }); await tx.update(people).set({ status: "Falecido", deathDate: now }).where(eq(people.id, patient.personId)); }
    if (record.appointmentId) {
      await tx.update(healthAppointments).set({ status: "Atendido", outcome: input.outcome, completedAt: now }).where(eq(healthAppointments.id, record.appointmentId));
      await tx.insert(healthAppointmentEvents).values({ appointmentId: record.appointmentId, eventType: "CARE_COMPLETED", fromStatus: "Em Atendimento", toStatus: "Atendido", notes: input.outcome, actorUsuarioId: context.user.id });
      await syncRegulationAppointment(tx, record.appointmentId, "Atendido", context.user.id);
    }
    return { id: record.id };
  });
}

export async function addHealthClinicalDocument(context: AppContext, input: { medicalRecordId: string; kind: string; title: string; file: File }) {
  const kind = input.kind.trim();
  const title = input.title.trim();
  if (!kind || kind.length > 100 || !title || title.length > 200) throw new HealthOperationError("Informe o tipo e o título do documento clínico.");
  const database = context.database ?? db;
  const [record] = await database.select({ id: medicalRecords.id, unitId: medicalRecords.unitId, completedAt: medicalRecords.completedAt, professionalId: medicalRecords.professionalId }).from(medicalRecords).where(eq(medicalRecords.id, input.medicalRecordId)).limit(1);
  if (!record) throw new HealthOperationError("Prontuário de atendimento não encontrado.");
  assertHealthUnitAccess(context.user, record.unitId);
  if (record.completedAt) throw new HealthOperationError("O atendimento concluído não aceita novos documentos.");
  if (!context.user.employeeId || !(await database.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.id, record.professionalId))).limit(1)).length) throw new HealthOperationError("Somente o profissional responsável pode anexar documentos ao atendimento.");
  const blob = await uploadFile(input.file);
  const content = new Uint8Array(await input.file.arrayBuffer());
  const result = await ingestGedDocument(healthDatabaseConnection(context), { title, documentType: kind, documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content, actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => { await activeRecord(tx, context, record.id); await tx.insert(healthClinicalDocuments).values({ medicalRecordId: record.id, documentId, kind, addedByUsuarioId: context.user.id }); } });
  return { id: result.documentId };
}
