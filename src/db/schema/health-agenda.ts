import { boolean, date, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthAppointments = pgTable("HealthAppointment", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), professionalId: text("professionalId"), schedulingGroupId: text("schedulingGroupId"), specialtyId: text("specialtyId"), serviceId: text("serviceId"), scheduleId: text("scheduleId"), visitType: text("visitType"), specialty: text("specialty"), origin: text("origin").notNull().default("SCHEDULED"), priority: text("priority").notNull().default("Normal"), status: text("status").notNull().default("Agendado"), cancelledAt: timestamp("cancelledAt", { precision: 3 }), cancellationReason: text("cancellationReason"), confirmedAt: timestamp("confirmedAt", { precision: 3 }), arrivedAt: timestamp("arrivedAt", { precision: 3 }), triagedAt: timestamp("triagedAt", { precision: 3 }), calledAt: timestamp("calledAt", { precision: 3 }), startedAt: timestamp("startedAt", { precision: 3 }), completedAt: timestamp("completedAt", { precision: 3 }), arrivalNotes: text("arrivalNotes"), municipalitySnapshot: text("municipalitySnapshot"), stateSnapshot: text("stateSnapshot"), billingContextSnapshot: jsonb("billingContextSnapshot"), outcome: text("outcome"), sequence: integer("sequence").notNull().default(0), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const healthAppointmentEvents = pgTable("HealthAppointmentEvent", {
  id: id(), appointmentId: text("appointmentId").notNull(), eventType: text("eventType").notNull(), fromStatus: text("fromStatus"), toStatus: text("toStatus"), notes: text("notes"), actorUsuarioId: text("actorUsuarioId").notNull(), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull().defaultNow(),
});

export const healthTriages = pgTable("HealthTriage", {
  id: id(), appointmentId: text("appointmentId").notNull(), professionalId: text("professionalId").notNull(), chiefComplaint: text("chiefComplaint").notNull(), bloodPressure: text("bloodPressure"), temperature: doublePrecision("temperature"), weight: doublePrecision("weight"), height: doublePrecision("height"), heartRate: integer("heartRate"), respiratoryRate: integer("respiratoryRate"), oxygenSaturation: doublePrecision("oxygenSaturation"), bloodGlucose: doublePrecision("bloodGlucose"), observedConditions: text("observedConditions"), riskClassification: text("riskClassification").notNull(), priorityLabel: text("priorityLabel").notNull(), notes: text("notes"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthTriage_appointmentId_key").on(t.appointmentId)]);

export const healthCareSchedules = pgTable("HealthCareSchedule", {
  id: id(), agreementId: text("agreementId"), procedureId: text("procedureId"), locationUnitId: text("locationUnitId"), validFrom: timestamp("validFrom", { precision: 3 }), validUntil: timestamp("validUntil", { precision: 3 }), genderRestriction: text("genderRestriction"), minAge: integer("minAge"), maxAge: integer("maxAge"), allowHolidays: boolean("allowHolidays").notNull().default(false), requirePresenceConfirmation: boolean("requirePresenceConfirmation").notNull().default(false), releaseAbsenceSlot: boolean("releaseAbsenceSlot").notNull().default(true), fixedReceiptTime: text("fixedReceiptTime"), slotMinutes: integer("slotMinutes").notNull().default(15), kind: text("kind").notNull().default("FIXO"), unitId: text("unitId").notNull(), specialtyId: text("specialtyId"), professionalId: text("professionalId"), groupId: text("groupId"), providerSupplierId: text("providerSupplierId"), weekday: integer("weekday"), date: date("date", { mode: "date" }), startTime: text("startTime"), endTime: text("endTime"), totalSlots: integer("totalSlots").notNull().default(1), status: text("status").notNull().default("Ativo"), blockReason: text("blockReason"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const healthWaitlists = pgTable("HealthWaitlist", {
  id: id(), unitId: text("unitId"), procedureId: text("procedureId"), programName: text("programName"), regulationRequestId: text("regulationRequestId"), appointmentId: text("appointmentId"), patientId: text("patientId").notNull(), specialtyId: text("specialtyId"), scheduleId: text("scheduleId"), priority: text("priority").notNull().default("Normal"), status: text("status").notNull().default("Aguardando"), notes: text("notes"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthWaitlist_regulationRequestId_key").on(t.regulationRequestId), uniqueIndex("HealthWaitlist_appointmentId_key").on(t.appointmentId)]);

export const healthWaitlistEvents = pgTable("HealthWaitlistEvent", {
  id: id(), waitlistId: text("waitlistId").notNull(), eventType: text("eventType").notNull(), fromStatus: text("fromStatus"), toStatus: text("toStatus").notNull(), notes: text("notes"), appointmentId: text("appointmentId"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});

export const healthScheduleBlocks = pgTable("HealthScheduleBlock", {
  id: id(), scheduleId: text("scheduleId").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
