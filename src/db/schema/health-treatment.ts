import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const time = (name: string) => timestamp(name, { precision: 3 });
const day = (name: string) => date(name, { mode: "date" }).notNull();

export const healthAuthorizationIssuers = pgTable("HealthAuthorizationIssuer", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), typeCode: text("typeCode").notNull(), sourceReference: text("sourceReference").notNull(), isActive: boolean("isActive").notNull().default(true), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthAuthorizationIssuer_code_key").on(t.code)]);
export const healthAuthorizationNumberRanges = pgTable("HealthAuthorizationNumberRange", {
  id: id(), issuerId: text("issuerId").notNull(), kind: text("kind").notNull(), firstNumber: text("firstNumber").notNull(), lastNumber: text("lastNumber").notNull(), nextNumber: text("nextNumber").notNull(), validFrom: day("validFrom"), validUntil: day("validUntil"), sourceReference: text("sourceReference").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthTreatmentReports = pgTable("HealthTreatmentReport", {
  id: id(), kind: text("kind").notNull(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), professionalId: text("professionalId").notNull(), medicalRecordId: text("medicalRecordId"), version: integer("version").notNull().default(1), status: text("status").notNull().default("SOLICITADA"), diagnosis: text("diagnosis").notNull(), diagnosticCode: text("diagnosticCode"), clinicalHistory: text("clinicalHistory").notNull(), examinations: text("examinations").notNull(), treatmentJustification: text("treatmentJustification").notNull(), admissionAt: time("admissionAt"), plannedStart: day("plannedStart"), plannedEnd: day("plannedEnd"), initialApac: boolean("initialApac").notNull().default(true), patientSnapshot: jsonb("patientSnapshot").notNull(), professionalSnapshot: jsonb("professionalSnapshot").notNull(), renewalOfId: text("renewalOfId"), paidManuallyAt: time("paidManuallyAt"), paidManuallyByUsuarioId: text("paidManuallyByUsuarioId"), manualPaymentReference: text("manualPaymentReference"), dischargedAt: time("dischargedAt"), dischargeOutcome: text("dischargeOutcome"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthTreatmentReport_renewalOfId_key").on(t.renewalOfId)]);
export const healthTreatmentReportProcedures = pgTable("HealthTreatmentReportProcedure", {
  id: id(), reportId: text("reportId").notNull(), procedureId: text("procedureId").notNull(), role: text("role").notNull(), quantity: integer("quantity").notNull(), performerProfessionalId: text("performerProfessionalId"),
}, t => [uniqueIndex("HealthTreatmentReportProcedure_reportId_procedureId_role_key").on(t.reportId, t.procedureId, t.role)]);
export const healthTreatmentReportRevisions = pgTable("HealthTreatmentReportRevision", {
  id: id(), reportId: text("reportId").notNull(), version: integer("version").notNull(), snapshot: jsonb("snapshot").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthTreatmentReportRevision_reportId_version_key").on(t.reportId, t.version)]);
export const healthTreatmentReportEvents = pgTable("HealthTreatmentReportEvent", {
  id: id(), reportId: text("reportId").notNull(), eventType: text("eventType").notNull(), fromStatus: text("fromStatus"), toStatus: text("toStatus").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthTreatmentAuthorizations = pgTable("HealthTreatmentAuthorization", {
  id: id(), reportId: text("reportId").notNull(), rangeId: text("rangeId").notNull(), kind: text("kind").notNull(), number: text("number").notNull(), reportVersion: integer("reportVersion").notNull(), validFrom: day("validFrom"), validUntil: day("validUntil"), authorizedByUsuarioId: text("authorizedByUsuarioId").notNull(), authorizedAt: time("authorizedAt").notNull().defaultNow(), status: text("status").notNull().default("ATIVA"), cancelledAt: time("cancelledAt"), cancelledByUsuarioId: text("cancelledByUsuarioId"), cancellationReason: text("cancellationReason"),
}, t => [uniqueIndex("HealthTreatmentAuthorization_reportId_key").on(t.reportId), uniqueIndex("HealthTreatmentAuthorization_kind_number_key").on(t.kind, t.number)]);
