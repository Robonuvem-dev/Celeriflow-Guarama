import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Read-only projections, checked against the physical historical SQL/schema.
// This reservation does not change the shared Saúde mappings or database DDL.
export const pageLaboratoryConfigurations = pgTable("HealthLaboratoryConfiguration", {
  id: text("id").primaryKey(), unitId: text("unitId").notNull(), laboratoryName: text("laboratoryName").notNull(), collectionStartTime: text("collectionStartTime").notNull(), collectionEndTime: text("collectionEndTime").notNull(), resultReleaseDays: integer("resultReleaseDays").notNull(), allowsExternalProcessing: boolean("allowsExternalProcessing").notNull(), requiresTechnicalReview: boolean("requiresTechnicalReview").notNull(), usesDigitalSignature: boolean("usesDigitalSignature").notNull(), publishesPatientPortal: boolean("publishesPatientPortal").notNull(), resultFooterMessage: text("resultFooterMessage"), effectiveFrom: text("effectiveFrom").notNull(), effectiveUntil: text("effectiveUntil"), isActive: boolean("isActive").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});
export const pageEsusBatches = pgTable("HealthEsusBatch", {
  id: text("id").primaryKey(), competence: text("competence").notNull(), status: text("status").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});
