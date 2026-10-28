import { boolean, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const time = (name: string) => timestamp(name, { precision: 3 });

export const healthPregnancies = pgTable("HealthPregnancy", {
  id: id(), patientId: text("patientId").notNull(), openedMedicalRecordId: text("openedMedicalRecordId").notNull(), unitId: text("unitId").notNull(), lastMenstrualDate: time("lastMenstrualDate"), ultrasoundDate: time("ultrasoundDate"), ultrasoundGestationalDays: integer("ultrasoundGestationalDays"), estimatedDeliveryDate: time("estimatedDeliveryDate").notNull(), calculationMethod: text("calculationMethod").notNull(), baselineWeight: doublePrecision("baselineWeight").notNull(), height: doublePrecision("height").notNull(), pregnancyType: text("pregnancyType").notNull(), previousPregnancies: integer("previousPregnancies").notNull(), lastScreeningDate: time("lastScreeningDate"), status: text("status").notNull().default("ACTIVE"), closureReason: text("closureReason"), closedAt: time("closedAt"), closedByUsuarioId: text("closedByUsuarioId"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthPregnancyVisits = pgTable("HealthPregnancyVisit", {
  id: id(), pregnancyId: text("pregnancyId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), occurredAt: time("occurredAt").notNull(), gestationalDays: integer("gestationalDays").notNull(), trimester: integer("trimester").notNull(), weight: doublePrecision("weight").notNull(), bmi: doublePrecision("bmi").notNull(), bloodPressure: text("bloodPressure"), notes: text("notes").notNull(), professionalId: text("professionalId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthPregnancyVisit_medicalRecordId_key").on(t.medicalRecordId)]);
export const healthPostpartumVisits = pgTable("HealthPostpartumVisit", {
  id: id(), pregnancyId: text("pregnancyId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), occurredAt: time("occurredAt").notNull(), outcome: text("outcome").notNull(), gestationalDaysAtBirth: integer("gestationalDaysAtBirth"), deliveryType: text("deliveryType"), deliveryLocation: text("deliveryLocation"), deliveryDate: time("deliveryDate"), clinicalConditions: text("clinicalConditions").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthPostpartumVisit_medicalRecordId_key").on(t.medicalRecordId)]);
export const healthChronicAssessments = pgTable("HealthChronicAssessment", {
  id: id(), patientId: text("patientId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), conditionKind: text("conditionKind").notNull(), assessedAt: time("assessedAt").notNull(), systolic: doublePrecision("systolic"), diastolic: doublePrecision("diastolic"), glucose: doublePrecision("glucose"), hba1c: doublePrecision("hba1c"), riskFactors: text("riskFactors").array().notNull(), complications: text("complications").array().notNull(), notes: text("notes").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthClinicalScreenings = pgTable("HealthClinicalScreening", {
  id: id(), patientId: text("patientId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), kind: text("kind").notNull(), eligible: boolean("eligible").notNull(), eligibilityReason: text("eligibilityReason").notNull(), requestedAt: time("requestedAt").notNull(), performedAt: time("performedAt"), resultedAt: time("resultedAt"), result: text("result"), status: text("status").notNull(), examRequestId: text("examRequestId"), followupNotes: text("followupNotes").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthDentalMarks = pgTable("HealthDentalMark", {
  id: id(), patientId: text("patientId").notNull(), medicalRecordId: text("medicalRecordId").notNull(), dentition: text("dentition").notNull(), targetType: text("targetType").notNull(), targetCode: text("targetCode").notNull(), surface: text("surface"), condition: text("condition").notNull(), procedureId: text("procedureId"), performedProcedureId: text("performedProcedureId"), performedAt: time("performedAt"), notes: text("notes").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthDentalMark_performedProcedureId_key").on(t.performedProcedureId)]);
export const healthTherapySessions = pgTable("HealthTherapySession", {
  id: id(), planId: text("planId").notNull(), sessionNumber: integer("sessionNumber").notNull(), specialtyKind: text("specialtyKind").notNull(), scheduledAt: time("scheduledAt").notNull(), performedAt: time("performedAt"), status: text("status").notNull().default("SCHEDULED"), evolution: text("evolution"), medicalRecordId: text("medicalRecordId"), professionalId: text("professionalId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthTherapySession_planId_sessionNumber_key").on(t.planId, t.sessionNumber)]);
export const specializedTherapeuticPlans = pgTable("SpecializedTherapeuticPlan", {
  id: id(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), teamId: text("teamId").notNull(), initialMedicalRecordId: text("initialMedicalRecordId"), status: text("status").notNull().default("ACTIVE"), goals: text("goals").notNull(), carePlan: text("carePlan").notNull(), plannedConsultations: integer("plannedConsultations").notNull(), completedConsultations: integer("completedConsultations").notNull().default(0), outcome: text("outcome"), startedAt: time("startedAt").notNull().defaultNow(), completedAt: time("completedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const specializedPlanEntries = pgTable("SpecializedPlanEntry", {
  id: id(), planId: text("planId").notNull(), professionalId: text("professionalId").notNull(), specialtyId: text("specialtyId"), medicalRecordId: text("medicalRecordId"), kind: text("kind").notNull(), content: text("content").notNull(), diagnosisSummary: text("diagnosisSummary"), weight: doublePrecision("weight"), height: doublePrecision("height"), bmi: doublePrecision("bmi"), createdAt: createdAt(), healthServiceId: text("healthServiceId"),
});
