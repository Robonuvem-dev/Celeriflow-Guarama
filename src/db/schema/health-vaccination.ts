import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const time = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => time("createdAt").notNull().defaultNow();
const updatedAt = () => time("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

// Physical historical tables, imported explicitly without global schema/DDL.
export const vaccines = pgTable("Vaccine", {
  id: id(), name: text("name").notNull(), disease: text("disease"), dosesRequired: integer("dosesRequired").notNull().default(1), isActive: boolean("isActive").notNull().default(true), materialId: text("materialId"), diluentMaterialId: text("diluentMaterialId"), diluentUnitsPerVial: doublePrecision("diluentUnitsPerVial").notNull().default(1), useAfterOpeningHours: doublePrecision("useAfterOpeningHours"), rndsAuthorized: boolean("rndsAuthorized").notNull().default(false), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("Vaccine_materialId_key").on(t.materialId)]);
export const vaccinationRecords = pgTable("VaccinationRecord", {
  id: id(), date: time("date").notNull().defaultNow(), doseNumber: integer("doseNumber").notNull().default(1), lotNumber: text("lotNumber"), manufacturer: text("manufacturer"), citizenCondition: text("citizenCondition"), strategy: text("strategy"), applicationSite: text("applicationSite"), applicationReason: text("applicationReason"), administrationRoute: text("administrationRoute"), shift: text("shift"), teamSnapshot: text("teamSnapshot"), idempotencyKey: text("idempotencyKey"), vaccineId: text("vaccineId").notNull(), patientId: text("patientId").notNull(), professionalId: text("professionalId").notNull(), unitId: text("unitId").notNull(), stockId: text("stockId"), movementId: text("movementId"), careGroup: text("careGroup"), actorUsuarioId: text("actorUsuarioId"), codeSnapshot: jsonb("codeSnapshot"), manufacturerId: text("manufacturerId"), campaignId: text("campaignId"), openedVialId: text("openedVialId"), indicationEventId: text("indicationEventId"), appointmentId: text("appointmentId"), medicalRecordId: text("medicalRecordId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("VaccinationRecord_idempotencyKey_key").on(t.idempotencyKey), uniqueIndex("VaccinationRecord_movementId_key").on(t.movementId), uniqueIndex("VaccinationRecord_indicationEventId_key").on(t.indicationEventId)]);
export const healthVaccineManufacturers = pgTable("HealthVaccineManufacturer", {
  id: id(), name: text("name").notNull(), rndsCode: text("rndsCode"), sourceReference: text("sourceReference"), isActive: boolean("isActive").notNull().default(true), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthVaccineManufacturer_rndsCode_key").on(t.rndsCode)]);
export const healthVaccineCodeMappings = pgTable("HealthVaccineCodeMapping", {
  id: id(), vaccineId: text("vaccineId").notNull(), system: text("system").notNull(), code: text("code").notNull(), version: text("version").notNull(), sourceReference: text("sourceReference").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthVaccineCodeMapping_vaccineId_system_version_key").on(t.vaccineId, t.system, t.version)]);
export const healthVaccineLotProfiles = pgTable("HealthVaccineLotProfile", {
  stockId: text("stockId").primaryKey(), dosesPerVial: integer("dosesPerVial").notNull(), manufacturerId: text("manufacturerId"), manufacturerName: text("manufacturerName"), actorUsuarioId: text("actorUsuarioId").notNull(), updatedAt: updatedAt(),
});
export const healthVaccineOpenedVials = pgTable("HealthVaccineOpenedVial", {
  id: id(), stockId: text("stockId").notNull(), vaccineId: text("vaccineId").notNull(), openedAt: time("openedAt").notNull(), expiresAt: time("expiresAt"), remainingDoses: integer("remainingDoses").notNull(), totalDoses: integer("totalDoses").notNull(), sourceReference: text("sourceReference"), adjustments: jsonb("adjustments").notNull().default([]), preparationKey: text("preparationKey"), diluentStockId: text("diluentStockId"), diluentMovementId: text("diluentMovementId"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthVaccineOpenedVial_preparationKey_key").on(t.preparationKey), uniqueIndex("HealthVaccineOpenedVial_diluentMovementId_key").on(t.diluentMovementId)]);
export const healthVaccineCalendarRules = pgTable("HealthVaccineCalendarRule", {
  id: id(), code: text("code").notNull(), version: integer("version").notNull(), vaccineId: text("vaccineId").notNull(), doseNumber: integer("doseNumber").notNull(), strategy: text("strategy").notNull(), ageUnit: text("ageUnit").notNull(), minimumAge: integer("minimumAge").notNull(), maximumAge: integer("maximumAge"), minimumIntervalDays: integer("minimumIntervalDays").notNull().default(0), repeatEveryMonths: integer("repeatEveryMonths"), required: boolean("required").notNull().default(true), enabled: boolean("enabled").notNull().default(true), validFrom: time("validFrom").notNull(), validUntil: time("validUntil"), sourceReference: text("sourceReference").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthVaccineCalendarRule_code_version_key").on(t.code, t.version)]);
export const healthVaccineInteractions = pgTable("HealthVaccineInteraction", {
  id: id(), firstVaccineId: text("firstVaccineId").notNull(), secondVaccineId: text("secondVaccineId").notNull(), minimumIntervalDays: integer("minimumIntervalDays").notNull(), allowSameDay: boolean("allowSameDay").notNull().default(false), sourceReference: text("sourceReference").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(),
}, t => [uniqueIndex("HealthVaccineInteraction_firstVaccineId_secondVaccineId_key").on(t.firstVaccineId, t.secondVaccineId)]);
export const healthVaccinationCampaigns = pgTable("HealthVaccinationCampaign", {
  id: id(), name: text("name").notNull(), startsAt: time("startsAt").notNull(), endsAt: time("endsAt").notNull(), publicInformation: text("publicInformation").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthVaccinationCardEvents = pgTable("HealthVaccinationCardEvent", {
  id: id(), patientId: text("patientId").notNull(), vaccineId: text("vaccineId").notNull(), kind: text("kind").notNull(), doseNumber: integer("doseNumber").notNull(), strategy: text("strategy").notNull(), occurredAt: time("occurredAt").notNull(), scheduledFor: time("scheduledFor"), until: time("until"), professionalId: text("professionalId").notNull(), unitId: text("unitId").notNull(), reason: text("reason").notNull(), sourceReference: text("sourceReference"), lotNumber: text("lotNumber"), revokedAt: time("revokedAt"), revokedReason: text("revokedReason"), revokedByUsuarioId: text("revokedByUsuarioId"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthVaccineAdverseEvents = pgTable("HealthVaccineAdverseEvent", {
  id: id(), patientId: text("patientId").notNull(), vaccineId: text("vaccineId").notNull(), vaccinationRecordId: text("vaccinationRecordId"), unitId: text("unitId").notNull(), occurredAt: time("occurredAt").notNull(), eventType: text("eventType").notNull(), lesionType: text("lesionType").notNull(), lesionLocation: text("lesionLocation").notNull(), severity: text("severity").notNull(), clinicalNotes: text("clinicalNotes").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthVaccineAdverseFollowups = pgTable("HealthVaccineAdverseFollowup", {
  id: id(), eventId: text("eventId").notNull(), occurredAt: time("occurredAt").notNull(), conduct: text("conduct").notNull(), narrative: text("narrative").notNull(), professionalId: text("professionalId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
