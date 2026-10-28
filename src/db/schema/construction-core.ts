import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";
import { departments, employees } from "./administration";

// Existing physical tables only. Cross-domain scalar references are resolved by
// explicit joins; these declarations do not register or change the database.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
export const constructionCatalogEntries = pgTable("ConstructionCatalogEntry", {
  id: id(), kind: text("kind").notNull(), name: text("name").notNull(), description: text("description"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("ConstructionCatalogEntry_kind_name_key").on(t.kind, t.name), index("ConstructionCatalogEntry_kind_isActive_name_idx").on(t.kind, t.isActive, t.name)]);
export const constructionConfigVersions = pgTable("ConstructionConfigVersion", {
  id: id(), version: integer("version").notNull().unique(), freeRevisions: integer("freeRevisions").notNull(), correctionDays: integer("correctionDays").notNull(), checkPropertyDebts: boolean("checkPropertyDebts").notNull(), subjectIds: text("subjectIds").array().notNull(), areaWeights: jsonb("areaWeights").$type<JsonValue>().notNull(), instructions: text("instructions").notNull(), publishedBy: text("publishedBy").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
});
export const constructionCases = pgTable("ConstructionCase", {
  id: id(), requestKey: text("requestKey").notNull().unique(), processId: text("processId").notNull().unique(), configurationId: text("configurationId").notNull(), category: text("category").notNull(), locationType: text("locationType").notNull(), regularization: boolean("regularization").notNull().default(false), catalogSnapshot: jsonb("catalogSnapshot").$type<JsonValue>().notNull(),
  existingArea: exactNumeric("existingArea", { precision: 14, scale: 4 }).notNull(), expandedArea: exactNumeric("expandedArea", { precision: 14, scale: 4 }).notNull(), irregularArea: exactNumeric("irregularArea", { precision: 14, scale: 4 }).notNull(), renovationArea: exactNumeric("renovationArea", { precision: 14, scale: 4 }).notNull(), demolitionArea: exactNumeric("demolitionArea", { precision: 14, scale: 4 }).notNull(), totalArea: exactNumeric("totalArea", { precision: 14, scale: 4 }).notNull(), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(), assignedEmployeeId: text("assignedEmployeeId"), createdBy: text("createdBy").notNull(), createdAt: createdAt(), additionalValues: jsonb("additionalValues").$type<JsonValue>().notNull().default({}), formSnapshot: jsonb("formSnapshot").$type<JsonValue>().notNull().default({}), reviewStatus: text("reviewStatus").notNull().default("SUBMITTED"), revisionCount: integer("revisionCount").notNull().default(0), firstAnalystId: text("firstAnalystId"), correctionDeadline: timestamp("correctionDeadline", { precision: 3 }),
});
export const constructionReviews = pgTable("ConstructionReview", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull().unique(), revision: integer("revision").notNull(), reviewType: text("reviewType").notNull(), decision: text("decision").notNull(), notes: text("notes").notNull(), definitionSnapshot: jsonb("definitionSnapshot").$type<JsonValue>().notNull(), evidenceSnapshot: jsonb("evidenceSnapshot").$type<JsonValue>().notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [index("ConstructionReview_caseId_createdAt_idx").on(t.caseId, t.createdAt)]);
export const constructionCaseProperties = pgTable("ConstructionCaseProperty", {
  id: id(), caseId: text("caseId").notNull(), realEstateId: text("realEstateId").notNull(), cadastralSnapshot: jsonb("cadastralSnapshot").$type<JsonValue>().notNull(),
}, t => [uniqueIndex("ConstructionCaseProperty_caseId_realEstateId_key").on(t.caseId, t.realEstateId)]);
export const constructionProfessionals = pgTable("ConstructionProfessional", {
  id: id(), personId: text("personId").notNull(), professionalType: text("professionalType").notNull(), council: text("council").notNull(), registration: text("registration").notNull(), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("ConstructionProfessional_council_registration_key").on(t.council, t.registration)]);
export const constructionPortalIdentities = pgTable("ConstructionPortalIdentity", {
  id: id(), firebaseUid: text("firebaseUid").notNull().unique(), email: text("email").notNull(), professionalId: text("professionalId").notNull().unique(), isActive: boolean("isActive").notNull().default(true), createdBy: text("createdBy").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const constructionParticipants = pgTable("ConstructionParticipant", {
  id: id(), caseId: text("caseId").notNull(), identityId: text("identityId").notNull(), role: text("role").notNull(), isActive: boolean("isActive").notNull().default(true), startsAt: timestamp("startsAt", { precision: 3 }).notNull().defaultNow(), endsAt: timestamp("endsAt", { precision: 3 }), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(),
}, t => [index("ConstructionParticipant_caseId_identityId_isActive_idx").on(t.caseId, t.identityId, t.isActive)]);
export const constructionViabilityResults = pgTable("ConstructionViabilityResult", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull().unique(), outcome: text("outcome").notNull(), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
});
export const constructionLifecycleStarts = pgTable("ConstructionLifecycleStart", {
  id: id(), caseId: text("caseId").notNull().unique().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), startedAt: date("startedAt", { mode: "date" }).notNull(), notes: text("notes").notNull(), evidenceSnapshot: jsonb("evidenceSnapshot").$type<JsonValue>().notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
});
export const constructionDistributionVersions = pgTable("ConstructionDistributionVersion", {
  id: id(), departmentId: text("departmentId").notNull().references(() => departments.id, { onDelete: "restrict", onUpdate: "cascade" }), version: integer("version").notNull(), strategy: text("strategy").notNull(), employeeId: text("employeeId").references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), publishedBy: text("publishedBy").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ConstructionDistributionVersion_departmentId_version_key").on(t.departmentId, t.version)]);
export const constructionAnalystReplacements = pgTable("ConstructionAnalystReplacement", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "cascade" }), requestKey: text("requestKey").notNull(), previousAnalystId: text("previousAnalystId").references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), previousAssignedId: text("previousAssignedId").references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), replacementEmployeeId: text("replacementEmployeeId").notNull().references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), departmentId: text("departmentId").notNull().references(() => departments.id, { onDelete: "restrict", onUpdate: "cascade" }), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("ConstructionAnalystReplacement_requestKey_key").on(t.requestKey), index("ConstructionAnalystReplacement_caseId_createdAt_idx").on(t.caseId, t.createdAt)]);
export const constructionConsultations = pgTable("ConstructionConsultation", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "cascade" }), requestKey: text("requestKey").notNull().unique(), requestedBy: text("requestedBy").notNull(), sourceDepartmentId: text("sourceDepartmentId").notNull().references(() => departments.id, { onDelete: "restrict", onUpdate: "cascade" }), targetDepartmentId: text("targetDepartmentId").notNull().references(() => departments.id, { onDelete: "restrict", onUpdate: "cascade" }), question: text("question").notNull(), dueAt: timestamp("dueAt", { precision: 3 }).notNull(), createdAt: createdAt(),
}, t => [index("ConstructionConsultation_targetDepartmentId_dueAt_idx").on(t.targetDepartmentId, t.dueAt)]);
export const constructionConsultationResponses = pgTable("ConstructionConsultationResponse", {
  id: id(), consultationId: text("consultationId").notNull().unique().references(() => constructionConsultations.id, { onDelete: "restrict", onUpdate: "cascade" }), employeeId: text("employeeId").notNull().references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), actorId: text("actorId").notNull(), opinion: text("opinion").notNull(), createdAt: createdAt(),
});
