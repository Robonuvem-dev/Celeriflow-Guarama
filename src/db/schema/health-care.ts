import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const medicalRecords = pgTable("MedicalRecord", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), type: text("type").notNull().default("Consulta"), patientId: text("patientId").notNull(), professionalId: text("professionalId").notNull(), unitId: text("unitId").notNull(), appointmentId: text("appointmentId"), careContextSnapshot: jsonb("careContextSnapshot"), bloodPressure: text("bloodPressure"), temperature: doublePrecision("temperature"), weight: doublePrecision("weight"), height: doublePrecision("height"), heartRate: integer("heartRate"), respiratoryRate: integer("respiratoryRate"), oxygenSaturation: doublePrecision("oxygenSaturation"), bloodGlucose: doublePrecision("bloodGlucose"), chiefComplaint: text("chiefComplaint"), anamnesis: text("anamnesis"), assessment: text("assessment"), evolution: text("evolution"), conduct: text("conduct"), observations: text("observations"), outcome: text("outcome"), completedAt: timestamp("completedAt", { precision: 3 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("MedicalRecord_appointmentId_key").on(t.appointmentId)]);

export const healthSpecialtyProcedureRules = pgTable("HealthSpecialtyProcedureRule", {
  id: id(), unitId: text("unitId"), specialtyId: text("specialtyId"), eventType: text("eventType").notNull(), procedureId: text("procedureId").notNull(), quantity: integer("quantity").notNull().default(1), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
});

export const healthClinicalEvolutions = pgTable("HealthClinicalEvolution", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), professionalId: text("professionalId").notNull(), content: text("content").notNull(), createdAt: createdAt(),
});
export const healthDiagnoses = pgTable("HealthDiagnosis", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), cidReferenceId: text("cidReferenceId").notNull(), isPrimary: boolean("isPrimary").notNull().default(false), notes: text("notes"), createdAt: createdAt(),
}, t => [uniqueIndex("HealthDiagnosis_medicalRecordId_cidReferenceId_key").on(t.medicalRecordId, t.cidReferenceId)]);
export const healthPerformedProcedures = pgTable("HealthPerformedProcedure", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), procedureId: text("procedureId").notNull(), professionalId: text("professionalId").notNull(), quantity: integer("quantity").notNull().default(1), notes: text("notes"), performedAt: timestamp("performedAt", { precision: 3 }).notNull().defaultNow(),
});
export const healthClinicalDocuments = pgTable("HealthClinicalDocument", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), documentId: text("documentId").notNull(), kind: text("kind").notNull(), addedByUsuarioId: text("addedByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthClinicalDocument_documentId_key").on(t.documentId)]);
export const healthExamRequests = pgTable("HealthExamRequest", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), examName: text("examName").notNull(), reason: text("reason"), status: text("status").notNull().default("Solicitado"), resultDate: timestamp("resultDate", { precision: 3 }), resultUrl: text("resultUrl"), patientId: text("patientId").notNull(), professionalId: text("professionalId").notNull(), unitId: text("unitId"), medicalRecordId: text("medicalRecordId"), procedureId: text("procedureId"), priority: text("priority").notNull().default("Rotina"), indication: text("indication"), notes: text("notes"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthReferrals = pgTable("HealthReferral", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), specialty: text("specialty").notNull(), reason: text("reason").notNull(), status: text("status").notNull().default("Pendente"), patientId: text("patientId").notNull(), professionalId: text("professionalId").notNull(), medicalRecordId: text("medicalRecordId"), specialtyId: text("specialtyId"), serviceId: text("serviceId"), destinationUnitId: text("destinationUnitId"), priority: text("priority").notNull().default("Normal"), observation: text("observation"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthObservations = pgTable("HealthObservation", {
  id: id(), medicalRecordId: text("medicalRecordId"), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), bedId: text("bedId"), responsible: text("responsible"), solicitedBy: text("solicitedBy"), status: text("status").notNull().default("Em observação"), admittedAt: timestamp("admittedAt", { precision: 3 }).notNull().defaultNow(), dischargedAt: timestamp("dischargedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthObservation_medicalRecordId_key").on(t.medicalRecordId)]);
export const healthPatientConditions = pgTable("HealthPatientCondition", {
  id: id(), patientId: text("patientId").notNull(), kind: text("kind").notNull(), chronicKind: text("chronicKind"), label: text("label").notNull(), startedAt: timestamp("startedAt", { precision: 3 }).notNull(), endedAt: timestamp("endedAt", { precision: 3 }), narrative: text("narrative").notNull(), medicalRecordId: text("medicalRecordId"), professionalId: text("professionalId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthPatientConditionRevisions = pgTable("HealthPatientConditionRevision", {
  id: id(), conditionId: text("conditionId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), before: jsonb("before"), after: jsonb("after").notNull(), createdAt: createdAt(),
});
export const healthOngoingMedications = pgTable("HealthOngoingMedication", {
  id: id(), patientId: text("patientId").notNull(), medicineId: text("medicineId"), name: text("name").notNull(), dosage: text("dosage").notNull(), startedAt: timestamp("startedAt", { precision: 3 }).notNull(), endedAt: timestamp("endedAt", { precision: 3 }), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthClinicalQuestionnaires = pgTable("HealthClinicalQuestionnaire", {
  id: id(), code: text("code").notNull(), version: integer("version").notNull(), name: text("name").notNull(), specialtyId: text("specialtyId"), conditionKind: text("conditionKind"), required: boolean("required").notNull().default(false), fields: jsonb("fields").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex("HealthClinicalQuestionnaire_code_version_key").on(t.code, t.version)]);
export const healthClinicalQuestionnaireResponses = pgTable("HealthClinicalQuestionnaireResponse", {
  id: id(), questionnaireId: text("questionnaireId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), answers: jsonb("answers").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthClinicalQuestionnaireResponse_questionnaireId_medicalRecordId_key").on(t.questionnaireId, t.medicalRecordId)]);
export const healthMedicationAdministrations = pgTable("HealthMedicationAdministration", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), medicineId: text("medicineId"), medicineName: text("medicineName").notNull(), dosage: text("dosage").notNull(), quantity: doublePrecision("quantity").notNull(), administeredAt: timestamp("administeredAt", { precision: 3 }).notNull(), patientOwned: boolean("patientOwned").notNull(), professionalId: text("professionalId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), movementId: text("movementId"), materials: jsonb("materials").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthMedicationAdministration_movementId_key").on(t.movementId)]);
export const healthCareRevisions = pgTable("HealthCareRevision", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), reason: text("reason").notNull(), before: jsonb("before").notNull(), after: jsonb("after").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthClinicalExamReviews = pgTable("HealthClinicalExamReview", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), examRequestId: text("examRequestId").notNull(), performedAt: timestamp("performedAt", { precision: 3 }), resultedAt: timestamp("resultedAt", { precision: 3 }), resultChanged: boolean("resultChanged").notNull(), providerSupplierId: text("providerSupplierId"), evaluation: text("evaluation").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthCounterreferences = pgTable("HealthCounterreference", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), referralId: text("referralId").notNull(), response: text("response").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthInternalCareReferrals = pgTable("HealthInternalCareReferral", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), appointmentId: text("appointmentId").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthInternalCareReferral_appointmentId_key").on(t.appointmentId)]);
export const healthClinicalDocumentTemplates = pgTable("HealthClinicalDocumentTemplate", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), kind: text("kind").notNull(), bodyHtml: text("bodyHtml").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthClinicalDocumentTemplate_code_key").on(t.code)]);
export const healthClinicalDocumentOrders = pgTable("HealthClinicalDocumentOrder", {
  id: id(), medicalRecordId: text("medicalRecordId").notNull(), kind: text("kind").notNull(), templateId: text("templateId"), data: jsonb("data").notNull(), documentId: text("documentId"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthClinicalDocumentOrder_documentId_key").on(t.documentId)]);
