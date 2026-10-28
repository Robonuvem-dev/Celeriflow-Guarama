import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { constructionCases } from "./construction-core";
import { processes } from "./processes";
import { documents, realEstates } from "./registry";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
export const constructionEnforcementCases = pgTable("ConstructionEnforcementCase", {
  id: id(), requestKey: text("requestKey").notNull().unique(), requestHash: text("requestHash").notNull(), processId: text("processId").notNull().unique().references(() => processes.id, { onDelete: "restrict", onUpdate: "no action" }), realEstateId: text("realEstateId").notNull().references(() => realEstates.id, { onDelete: "restrict", onUpdate: "no action" }), permitCaseId: text("permitCaseId").references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), locationType: text("locationType").notNull(), permitStatus: text("permitStatus").notNull(), reason: text("reason").notNull(), cadastralSnapshot: jsonb("cadastralSnapshot").$type<JsonValue>().notNull(), assignedEmployeeId: text("assignedEmployeeId"), status: text("status").notNull().default("OPEN"), revision: integer("revision").notNull().default(0), isDemonstration: boolean("isDemonstration").notNull().default(true), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [index("ConstructionEnforcementCase_realEstateId_createdAt_idx").on(t.realEstateId, t.createdAt)]);
export const constructionEnforcementAssignments = pgTable("ConstructionEnforcementAssignment", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionEnforcementCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), requestHash: text("requestHash").notNull(), previousEmployeeId: text("previousEmployeeId"), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), staffRoleId: text("staffRoleId").notNull(), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [index("ConstructionEnforcementAssignment_caseId_createdAt_idx").on(t.caseId, t.createdAt)]);
export const constructionEnforcementVisits = pgTable("ConstructionEnforcementVisit", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionEnforcementCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), requestHash: text("requestHash").notNull(), visitedAt: timestamp("visitedAt", { precision: 3 }).notNull(), findings: text("findings").notNull(), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), staffRoleId: text("staffRoleId").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [index("ConstructionEnforcementVisit_caseId_visitedAt_idx").on(t.caseId, t.visitedAt)]);
export const constructionEnforcementActs = pgTable("ConstructionEnforcementAct", {
  id: id(), caseId: text("caseId").notNull().references(() => constructionEnforcementCases.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), requestHash: text("requestHash").notNull(), number: text("number").notNull().unique(), kind: text("kind").notNull(), visitId: text("visitId").references(() => constructionEnforcementVisits.id, { onDelete: "restrict", onUpdate: "no action" }), relatedActId: text("relatedActId").references((): AnyPgColumn => constructionEnforcementActs.id, { onDelete: "restrict", onUpdate: "no action" }), reason: text("reason").notNull(), legalBasis: text("legalBasis").notNull(), issuedAt: timestamp("issuedAt", { precision: 3 }).notNull(), deadlineAt: timestamp("deadlineAt", { precision: 3 }), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), staffRoleId: text("staffRoleId").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [index("ConstructionEnforcementAct_caseId_issuedAt_idx").on(t.caseId, t.issuedAt)]);
export const constructionEnforcementAcknowledgements = pgTable("ConstructionEnforcementAcknowledgement", {
  id: id(), actId: text("actId").notNull().references(() => constructionEnforcementActs.id, { onDelete: "restrict", onUpdate: "no action" }), requestKey: text("requestKey").notNull().unique(), requestHash: text("requestHash").notNull(), acknowledgedAt: timestamp("acknowledgedAt", { precision: 3 }).notNull(), method: text("method").notNull(), recipient: text("recipient").notNull(), notes: text("notes").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
});
export const constructionEnforcementEvidence = pgTable("ConstructionEnforcementEvidence", {
  id: id(), documentId: text("documentId").notNull().references(() => documents.id, { onDelete: "restrict", onUpdate: "no action" }), visitId: text("visitId").references(() => constructionEnforcementVisits.id, { onDelete: "restrict", onUpdate: "no action" }), actId: text("actId").references(() => constructionEnforcementActs.id, { onDelete: "restrict", onUpdate: "no action" }), acknowledgementId: text("acknowledgementId").references(() => constructionEnforcementAcknowledgements.id, { onDelete: "restrict", onUpdate: "no action" }), kind: text("kind").notNull(), versionSnapshot: jsonb("versionSnapshot").$type<JsonValue>().notNull(), createdAt: createdAt(),
}, t => [index("ConstructionEnforcementEvidence_documentId_idx").on(t.documentId)]);
export const constructionEnforcementSequences = pgTable("ConstructionEnforcementSequence", {
  year: integer("year").notNull(), kind: text("kind").notNull(), nextNumber: integer("nextNumber").notNull(),
}, t => [primaryKey({ columns: [t.year, t.kind] })]);
