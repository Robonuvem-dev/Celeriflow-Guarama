import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";
import type { evaluateAutomaticConstructionViability } from "@/lib/obras/construction-automatic-viability-policy";
import { constructionCases, constructionPortalIdentities, constructionViabilityResults } from "./construction-core";
import { documents, realEstates } from "./registry";
import { documentVersions } from "./document-workflow";

const id = () => text("id").primaryKey().$defaultFn(createId);
export const constructionDefinitionVersions = pgTable("ConstructionDefinitionVersion", {
  id: id(), kind: text("kind").notNull(), version: integer("version").notNull(), definition: jsonb("definition").$type<JsonValue>().notNull(), publishedBy: text("publishedBy").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ConstructionDefinitionVersion_kind_version_key").on(t.kind, t.version)]);
export const constructionZoneVersions = pgTable("ConstructionZoneVersion", {
  id: id(), code: text("code").notNull(), version: integer("version").notNull(), name: text("name").notNull(), legalBasis: text("legalBasis").notNull(), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }), allowedPurposeIds: text("allowedPurposeIds").array().notNull(), allowedCategories: text("allowedCategories").array().notNull(), minimumLandArea: exactNumeric("minimumLandArea", { precision: 14, scale: 4 }).notNull(), maxFloorAreaRatio: exactNumeric("maxFloorAreaRatio", { precision: 10, scale: 4 }).notNull(), automatic: boolean("automatic").notNull(), publishedBy: text("publishedBy").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ConstructionZoneVersion_code_version_key").on(t.code, t.version)]);
export const constructionPropertyZones = pgTable("ConstructionPropertyZone", {
  id: id(), realEstateId: text("realEstateId").notNull().unique().references(() => realEstates.id, { onDelete: "restrict", onUpdate: "cascade" }), zoneId: text("zoneId").notNull().references(() => constructionZoneVersions.id, { onDelete: "restrict", onUpdate: "cascade" }), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const constructionAutomaticViabilityRuns = pgTable("ConstructionAutomaticViabilityRun", {
  id: id(), requestKey: text("requestKey").notNull().unique(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), identityId: text("identityId").notNull().references(() => constructionPortalIdentities.id, { onDelete: "restrict", onUpdate: "no action" }), outcome: text("outcome").notNull(), calculationSnapshot: jsonb("calculationSnapshot").$type<ReturnType<typeof evaluateAutomaticConstructionViability>>().notNull(), viabilityResultId: text("viabilityResultId").notNull().unique().references(() => constructionViabilityResults.id, { onDelete: "restrict", onUpdate: "no action" }), documentId: text("documentId").unique().references(() => documents.id, { onDelete: "restrict", onUpdate: "no action" }), documentVersionId: text("documentVersionId").unique().references(() => documentVersions.id, { onDelete: "restrict", onUpdate: "no action" }), signatureRoutingStatus: text("signatureRoutingStatus").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("ConstructionAutomaticViabilityRun_caseId_createdAt_idx").on(t.caseId, t.createdAt)]);
