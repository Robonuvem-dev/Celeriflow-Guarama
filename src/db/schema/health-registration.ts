import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const patients = pgTable("Patient", {
  id: id(), cns: text("cns"), bloodType: text("bloodType"), bloodDonor: boolean("bloodDonor"), knownAllergies: text("knownAllergies"), specialNeeds: text("specialNeeds"), status: text("status").notNull().default("Ativo"), personId: text("personId").notNull(), referenceUnitId: text("referenceUnitId"), teamId: text("teamId"), usuarioId: text("usuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("Patient_cns_key").on(t.cns), uniqueIndex("Patient_personId_key").on(t.personId), uniqueIndex("Patient_usuarioId_key").on(t.usuarioId)]);

export const healthPatientRegistrations = pgTable("HealthPatientRegistration", {
  patientId: text("patientId").primaryKey(), stage: text("stage").notNull().default("COMPLETE"), reviewedAt: timestamp("reviewedAt", { precision: 3 }).notNull().defaultNow(), contactStartTime: text("contactStartTime"), contactEndTime: text("contactEndTime"), workplace: text("workplace"), socialMotherName: text("socialMotherName"), socialFatherName: text("socialFatherName"), deathRegisteredAt: timestamp("deathRegisteredAt", { precision: 3 }), deathMunicipality: text("deathMunicipality"), deathCause: text("deathCause"), deathCidReferenceId: text("deathCidReferenceId"), photoDocumentId: text("photoDocumentId"), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const healthPatientRegistrationChanges = pgTable("HealthPatientRegistrationChange", {
  id: id(), patientId: text("patientId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), changes: jsonb("changes").notNull(), createdAt: createdAt(),
});

export const healthPatientContacts = pgTable("HealthPatientContact", {
  id: id(), patientId: text("patientId").notNull(), name: text("name").notNull(), phone: text("phone").notNull(), kinship: text("kinship").notNull(), relationshipKind: text("relationshipKind").notNull().default("BIOLOGICAL"), startTime: text("startTime"), endTime: text("endTime"), isActive: boolean("isActive").notNull().default(true), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const healthPatientCalls = pgTable("HealthPatientCall", {
  id: id(), patientId: text("patientId").notNull(), regulationRequestId: text("regulationRequestId"), calledAt: timestamp("calledAt", { precision: 3 }).notNull(), phone: text("phone").notNull(), result: text("result").notNull(), notes: text("notes"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});

export const healthPatientDocuments = pgTable("HealthPatientDocument", {
  id: id(), patientId: text("patientId").notNull(), documentId: text("documentId").notNull(), kind: text("kind").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthPatientDocument_patientId_documentId_key").on(t.patientId, t.documentId)]);
