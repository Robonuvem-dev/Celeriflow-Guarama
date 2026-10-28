import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { employees } from "./administration";
import { people } from "./people";
import { fleetBookings, fleetUnits } from "./fleet";
import { hrPortalRequests } from "./personnel-workforce";
import { patients } from "./health-registration";
import { healthUnits, healthProfessionals } from "./health-workforce";
import { healthRegulationRequests } from "./health-regulation";
import { medicalRecords } from "./health-care";
import { healthSusProcedures } from "./health-catalogs";

// Installed baseline + 20261015200000/20261015210000, verified against catalog.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const updatedAtDefault = () => timestamp("updatedAt", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date());
const instant = (name: string) => timestamp(name, { precision: 3 });
const money = (name: string) => exactNumeric(name, { precision: 14, scale: 2 });

export const healthTfdRequests = pgTable("HealthTfdRequest", {
  id: id(), patientId: text("patientId").notNull(), regulationRequestId: text("regulationRequestId"), originUnitId: text("originUnitId"), destination: text("destination").notNull(), reason: text("reason").notNull(), priority: text("priority").notNull().default("Normal"), status: text("status").notNull().default("SOLICITADA"), companionName: text("companionName"), companionDocument: text("companionDocument"), authorizedAt: instant("authorizedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index("HealthTfdRequest_status_createdAt_idx").on(t.status, t.createdAt), index("HealthTfdRequest_patientId_status_idx").on(t.patientId, t.status),
  foreignKey({ name: "HealthTfdRequest_patientId_fkey", columns: [t.patientId], foreignColumns: [patients.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdRequest_originUnitId_fkey", columns: [t.originUnitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdRequest_regulationRequestId_fkey", columns: [t.regulationRequestId], foreignColumns: [healthRegulationRequests.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const healthTfdClinicalReports = pgTable("HealthTfdClinicalReport", {
  id: id(), requestId: text("requestId").notNull(), version: integer("version").notNull().default(1), medicalRecordId: text("medicalRecordId"), professionalId: text("professionalId").notNull(), procedureId: text("procedureId"), diagnosis: text("diagnosis").notNull(), diagnosticCode: text("diagnosticCode"), clinicalHistory: text("clinicalHistory").notNull(), examinations: text("examinations").notNull(), treatment: text("treatment").notNull(), localTreatmentUnavailableReason: text("localTreatmentUnavailableReason").notNull(), transportType: text("transportType").notNull(), transportJustification: text("transportJustification").notNull(), companionRequired: boolean("companionRequired").notNull().default(false), companionJustification: text("companionJustification"), patientSnapshot: jsonb("patientSnapshot").$type<JsonValue>().notNull(), professionalSnapshot: jsonb("professionalSnapshot").$type<JsonValue>().notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAtDefault(),
}, t => [
  uniqueIndex("HealthTfdClinicalReport_requestId_key").on(t.requestId), index("HealthTfdClinicalReport_professionalId_procedureId_idx").on(t.professionalId, t.procedureId),
  foreignKey({ name: "HealthTfdClinicalReport_requestId_fkey", columns: [t.requestId], foreignColumns: [healthTfdRequests.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdClinicalReport_medicalRecordId_fkey", columns: [t.medicalRecordId], foreignColumns: [medicalRecords.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdClinicalReport_professionalId_fkey", columns: [t.professionalId], foreignColumns: [healthProfessionals.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdClinicalReport_procedureId_fkey", columns: [t.procedureId], foreignColumns: [healthSusProcedures.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const healthTfdReportRevisions = pgTable("HealthTfdReportRevision", {
  id: id(), reportId: text("reportId").notNull(), version: integer("version").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthTfdReportRevision_reportId_version_key").on(t.reportId, t.version), foreignKey({ name: "HealthTfdReportRevision_reportId_fkey", columns: [t.reportId], foreignColumns: [healthTfdClinicalReports.id] }).onDelete("restrict").onUpdate("cascade")]);
export const healthTfdReportSupplements = pgTable("HealthTfdReportSupplement", {
  id: id(), reportId: text("reportId").notNull(), reportVersion: integer("reportVersion").notNull(), narrative: text("narrative").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [index("HealthTfdReportSupplement_reportId_createdAt_idx").on(t.reportId, t.createdAt), foreignKey({ name: "HealthTfdReportSupplement_reportId_fkey", columns: [t.reportId], foreignColumns: [healthTfdClinicalReports.id] }).onDelete("restrict").onUpdate("cascade")]);
export const healthTfdRequestEvents = pgTable("HealthTfdRequestEvent", {
  id: id(), requestId: text("requestId").notNull(), eventType: text("eventType").notNull(), fromStatus: text("fromStatus"), toStatus: text("toStatus").notNull(), reportVersion: integer("reportVersion"), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [index("HealthTfdRequestEvent_requestId_createdAt_idx").on(t.requestId, t.createdAt), foreignKey({ name: "HealthTfdRequestEvent_requestId_fkey", columns: [t.requestId], foreignColumns: [healthTfdRequests.id] }).onDelete("restrict").onUpdate("cascade")]);
export const healthTfdBenefits = pgTable("HealthTfdBenefit", {
  id: id(), requestId: text("requestId").notNull(), reportVersion: integer("reportVersion").notNull(), kind: text("kind").notNull(), description: text("description").notNull(), quantity: integer("quantity").notNull(), unitValue: money("unitValue"), status: text("status").notNull().default("SOLICITADO"), createdByUsuarioId: text("createdByUsuarioId").notNull(), authorizedByUsuarioId: text("authorizedByUsuarioId"), authorizedAt: instant("authorizedAt"), deliveredByUsuarioId: text("deliveredByUsuarioId"), deliveredAt: instant("deliveredAt"), receivedByPersonId: text("receivedByPersonId"), deliveryReceipt: text("deliveryReceipt"), createdAt: createdAt(), updatedAt: updatedAtDefault(),
}, t => [
  index("HealthTfdBenefit_requestId_status_idx").on(t.requestId, t.status), check("HealthTfdBenefit_quantity_check", sql`${t.quantity} > 0`), check("HealthTfdBenefit_unitValue_check", sql`${t.unitValue} >= 0`),
  foreignKey({ name: "HealthTfdBenefit_requestId_fkey", columns: [t.requestId], foreignColumns: [healthTfdRequests.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdBenefit_receivedByPersonId_fkey", columns: [t.receivedByPersonId], foreignColumns: [people.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const healthTfdTrips = pgTable("HealthTfdTrip", {
  id: id(), date: date("date", { mode: "date" }).notNull(), origin: text("origin").notNull(), destination: text("destination").notNull(), fleetUnitId: text("fleetUnitId").notNull(), driverEmployeeId: text("driverEmployeeId"), capacity: integer("capacity").notNull(), status: text("status").notNull().default("PLANEJADA"), departureAt: instant("departureAt"), returnAt: instant("returnAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(), fleetBookingId: text("fleetBookingId"), assistantEmployeeId: text("assistantEmployeeId"), responsibleEmployeeId: text("responsibleEmployeeId"), advanceRequestId: text("advanceRequestId"), advanceAuthorizedAmount: money("advanceAuthorizedAmount"), purpose: text("purpose"), confirmedAt: instant("confirmedAt"), confirmedByUsuarioId: text("confirmedByUsuarioId"),
}, t => [
  uniqueIndex("HealthTfdTrip_fleetBookingId_key").on(t.fleetBookingId), index("HealthTfdTrip_date_status_idx").on(t.date, t.status), index("HealthTfdTrip_fleetUnitId_date_idx").on(t.fleetUnitId, t.date),
  foreignKey({ name: "HealthTfdTrip_fleetUnitId_fkey", columns: [t.fleetUnitId], foreignColumns: [fleetUnits.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdTrip_fleetBookingId_fkey", columns: [t.fleetBookingId], foreignColumns: [fleetBookings.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdTrip_driverEmployeeId_fkey", columns: [t.driverEmployeeId], foreignColumns: [employees.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdTrip_assistantEmployeeId_fkey", columns: [t.assistantEmployeeId], foreignColumns: [employees.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdTrip_responsibleEmployeeId_fkey", columns: [t.responsibleEmployeeId], foreignColumns: [employees.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdTrip_advanceRequestId_fkey", columns: [t.advanceRequestId], foreignColumns: [hrPortalRequests.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const healthTfdPassengers = pgTable("HealthTfdPassenger", {
  id: id(), tripId: text("tripId").notNull(), patientId: text("patientId").notNull(), tfdRequestId: text("tfdRequestId"), companionName: text("companionName"), companionDocument: text("companionDocument"), kind: text("kind").notNull().default("PACIENTE"), createdAt: createdAt(), boardingLocation: text("boardingLocation"), presenceStatus: text("presenceStatus").notNull().default("PENDING"), presenceAt: instant("presenceAt"), presenceByUsuarioId: text("presenceByUsuarioId"),
}, t => [
  uniqueIndex("HealthTfdPassenger_tripId_patientId_kind_key").on(t.tripId, t.patientId, t.kind), index("HealthTfdPassenger_patientId_idx").on(t.patientId),
  foreignKey({ name: "HealthTfdPassenger_tripId_fkey", columns: [t.tripId], foreignColumns: [healthTfdTrips.id] }).onDelete("cascade").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdPassenger_patientId_fkey", columns: [t.patientId], foreignColumns: [patients.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthTfdPassenger_tfdRequestId_fkey", columns: [t.tfdRequestId], foreignColumns: [healthTfdRequests.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const healthTfdPassengerRemovals = pgTable("HealthTfdPassengerRemoval", {
  id: id(), passengerId: text("passengerId").notNull(), requestedByUsuarioId: text("requestedByUsuarioId").notNull(), confirmedByUsuarioId: text("confirmedByUsuarioId"), status: text("status").notNull().default("Pendente"), createdAt: createdAt(),
}, t => [uniqueIndex("HealthTfdPassengerRemoval_passengerId_key").on(t.passengerId), foreignKey({ name: "HealthTfdPassengerRemoval_passengerId_fkey", columns: [t.passengerId], foreignColumns: [healthTfdPassengers.id] }).onDelete("cascade").onUpdate("cascade")]);
export const healthTfdTripEvents = pgTable("HealthTfdTripEvent", {
  id: id(), tripId: text("tripId").notNull(), passengerId: text("passengerId"), eventType: text("eventType").notNull(), reason: text("reason").notNull(), metadata: jsonb("metadata").$type<JsonValue>(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [index("HealthTfdTripEvent_tripId_createdAt_idx").on(t.tripId, t.createdAt), foreignKey({ name: "HealthTfdTripEvent_tripId_fkey", columns: [t.tripId], foreignColumns: [healthTfdTrips.id] }).onDelete("restrict").onUpdate("cascade")]);
