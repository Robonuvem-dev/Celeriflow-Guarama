import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const time = (name: string) => timestamp(name, { precision: 3 });

export const healthTerritoryAreas = pgTable("HealthTerritoryArea", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), unitId: text("unitId"), teamId: text("teamId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthTerritoryArea_code_key").on(t.code)]);
export const healthMicroareas = pgTable("HealthMicroarea", {
  id: id(), code: text("code").notNull(), areaId: text("areaId").notNull(), agentProfessionalId: text("agentProfessionalId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex("HealthMicroarea_areaId_code_key").on(t.areaId, t.code)]);
export const healthHouseholds = pgTable("HealthHousehold", {
  id: id(), householdCode: text("householdCode"), microareaId: text("microareaId"), addressId: text("addressId"), housingDetails: jsonb("housingDetails"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthHousehold_householdCode_key").on(t.householdCode)]);
export const healthFamilies = pgTable("HealthFamily", {
  id: id(), classification: text("classification"), familyType: text("familyType"), unitId: text("unitId"), teamId: text("teamId"), familyCode: text("familyCode"), householdId: text("householdId"), responsiblePersonId: text("responsiblePersonId"), masterFamilyId: text("masterFamilyId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthFamily_masterFamilyId_key").on(t.masterFamilyId)]);
export const healthFamilyMembers = pgTable("HealthFamilyMember", {
  id: id(), familyId: text("familyId").notNull(), personId: text("personId").notNull(), kinship: text("kinship"), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFamilyMember_personId_key").on(t.personId)]);
export const healthHomeVisits = pgTable("HealthHomeVisit", {
  id: id(), unitId: text("unitId"), householdId: text("householdId"), familyId: text("familyId"), teamId: text("teamId"), professionalId: text("professionalId").notNull(), areaId: text("areaId"), microareaId: text("microareaId"), visitedAt: time("visitedAt").notNull(), actions: text("actions").notNull(), observations: text("observations"), status: text("status").notNull().default("REALIZADA"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthHomeVisitParticipants = pgTable("HealthHomeVisitParticipant", {
  id: id(), outcome: text("outcome").notNull().default("PRESENT"), refusalReason: text("refusalReason"), weight: doublePrecision("weight"), height: doublePrecision("height"), bloodPressure: text("bloodPressure"), temperature: doublePrecision("temperature"), heartRate: integer("heartRate"), bloodGlucose: doublePrecision("bloodGlucose"), visitId: text("visitId").notNull(), personId: text("personId").notNull(), patientId: text("patientId"), createdAt: createdAt(),
}, t => [uniqueIndex("HealthHomeVisitParticipant_visitId_personId_key").on(t.visitId, t.personId)]);
export const healthEsusForms = pgTable("HealthEsusForm", {
  id: id(), kind: text("kind").notNull(), householdId: text("householdId"), familyId: text("familyId"), personId: text("personId"), patientId: text("patientId"), professionalId: text("professionalId"), teamId: text("teamId"), unitId: text("unitId"), period: text("period").notNull(), status: text("status").notNull().default("RASCUNHO"), payload: jsonb("payload"), originMedicalRecordId: text("originMedicalRecordId"), idempotencyKey: text("idempotencyKey").notNull(), finalizedAt: time("finalizedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthEsusForm_idempotencyKey_key").on(t.idempotencyKey)]);
export const healthFamilyEvents = pgTable("HealthFamilyEvent", {
  id: id(), familyId: text("familyId").notNull(), eventType: text("eventType").notNull(), personId: text("personId"), effectiveAt: time("effectiveAt").notNull(), reason: text("reason").notNull(), snapshot: jsonb("snapshot").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthFamilyDocuments = pgTable("HealthFamilyDocument", {
  id: id(), familyId: text("familyId").notNull(), documentId: text("documentId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFamilyDocument_familyId_documentId_key").on(t.familyId, t.documentId)]);
export const healthHomeCareRequests = pgTable("HealthHomeCareRequest", {
  id: id(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), requestedAt: time("requestedAt").notNull(), reason: text("reason").notNull(), status: text("status").notNull().default("REQUESTED"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthHomeCareAssessments = pgTable("HealthHomeCareAssessment", {
  id: id(), requestId: text("requestId").notNull(), assessedAt: time("assessedAt").notNull(), professionalId: text("professionalId").notNull(), eligible: boolean("eligible").notNull(), modality: text("modality").notNull(), cidReferenceId: text("cidReferenceId"), character: text("character").notNull(), evaluation: text("evaluation").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthHomeCareAttendances = pgTable("HealthHomeCareAttendance", {
  id: id(), requestId: text("requestId").notNull(), assessmentId: text("assessmentId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), performedAt: time("performedAt").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthHomeCareAttendance_medicalRecordId_key").on(t.medicalRecordId)]);
export const healthCollectiveActivities = pgTable("HealthCollectiveActivity", {
  id: id(), teamSnapshot: jsonb("teamSnapshot"), unitId: text("unitId").notNull(), teamId: text("teamId").notNull(), professionalId: text("professionalId").notNull(), occurredAt: time("occurredAt").notNull(), activityType: text("activityType").notNull(), themes: text("themes").array().notNull(), practices: text("practices").array().notNull(), participantIds: text("participantIds").array().notNull(), procedureId: text("procedureId"), notes: text("notes"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthFoodMarkers = pgTable("HealthFoodMarker", {
  id: id(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), professionalId: text("professionalId").notNull(), recordedAt: time("recordedAt").notNull(), ageGroup: text("ageGroup").notNull(), place: text("place").notNull(), markers: jsonb("markers").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
