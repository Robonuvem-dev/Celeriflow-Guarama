import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthSusProcedures = pgTable("HealthSusProcedure", {
  id: id(), source: text("source").notNull(), competence: text("competence").notNull(), code: text("code").notNull(), description: text("description").notNull(), groupCode: text("groupCode"), groupName: text("groupName"), subgroupCode: text("subgroupCode"), subgroupName: text("subgroupName"), complexity: text("complexity"), registrationInstrument: text("registrationInstrument"), unitValue: exactNumeric("unitValue", { precision: 14, scale: 2 }), minimumAge: integer("minimumAge"), maximumAge: integer("maximumAge"), allowedSex: text("allowedSex"), financing: text("financing"), cidCodes: text("cidCodes"), cboCodes: text("cboCodes"), serviceCodes: text("serviceCodes"), classificationCodes: text("classificationCodes"), isActive: boolean("isActive").notNull().default(true), isCurrent: boolean("isCurrent").notNull().default(true), sourceBatchId: text("sourceBatchId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthSusProcedure_sourceBatchId_code_key").on(t.sourceBatchId, t.code)]);
export const healthSusReferences = pgTable("HealthSusReference", {
  id: id(), source: text("source").notNull(), competence: text("competence").notNull(), kind: text("kind").notNull(), code: text("code").notNull(), description: text("description").notNull(), classification: text("classification"), isActive: boolean("isActive").notNull().default(true), isCurrent: boolean("isCurrent").notNull().default(true), sourceBatchId: text("sourceBatchId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthSusReference_sourceBatchId_kind_code_key").on(t.sourceBatchId, t.kind, t.code)]);
export const healthSusProcedureReferences = pgTable("HealthSusProcedureReference", {
  id: id(), procedureId: text("procedureId").notNull(), referenceId: text("referenceId").notNull(), relationType: text("relationType").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthSusProcedureReference_procedureId_referenceId_relationType_key").on(t.procedureId, t.referenceId, t.relationType)]);

export const healthSusImportBatches = pgTable("HealthSusImportBatch", {
  id: id(), source: text("source").notNull(), competence: text("competence").notNull(), origin: text("origin").notNull(), fileName: text("fileName").notNull(), fileFormat: text("fileFormat").notNull(), contractVersion: text("contractVersion").notNull(), checksum: text("checksum").notNull(), status: text("status").notNull().default("PROCESSING"), processedCount: integer("processedCount").notNull().default(0), insertedCount: integer("insertedCount").notNull().default(0), updatedCount: integer("updatedCount").notNull().default(0), ignoredCount: integer("ignoredCount").notNull().default(0), issueCount: integer("issueCount").notNull().default(0), startedAt: timestamp("startedAt", { precision: 3 }).notNull().defaultNow(), completedAt: timestamp("completedAt", { precision: 3 }), actorUsuarioId: text("actorUsuarioId").notNull(),
}, t => [uniqueIndex("HealthSusImportBatch_source_competence_checksum_key").on(t.source, t.competence, t.checksum)]);
export const healthSusImportIssues = pgTable("HealthSusImportIssue", {
  id: id(), batchId: text("batchId").notNull(), rowNumber: integer("rowNumber").notNull(), entityType: text("entityType").notNull(), reason: text("reason").notNull(), createdAt: createdAt(),
});
