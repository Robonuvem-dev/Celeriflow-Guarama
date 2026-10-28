import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { constructionCases, constructionPortalIdentities } from "./construction-core";
import { people } from "./people";
import { companies } from "./registry";
import { users } from "./identity";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
export const constructionTerms = pgTable("ConstructionTermVersion", {
  id: id(), version: integer("version").notNull().unique(), text: text("text").notNull(), publishedBy: text("publishedBy").notNull(), publishedAt: timestamp("publishedAt", { precision: 3 }).notNull().defaultNow(),
});
export const constructionTermAcceptances = pgTable("ConstructionTermAcceptance", {
  id: id(), caseId: text("caseId").notNull(), identityId: text("identityId").notNull(), termId: text("termId").notNull(), acceptedAt: timestamp("acceptedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ConstructionTermAcceptance_caseId_identityId_termId_key").on(t.caseId, t.identityId, t.termId)]);
export const constructionMessages = pgTable("ConstructionMessage", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull().unique(), identityId: text("identityId"), employeeId: text("employeeId"), content: text("content").notNull(), documentId: text("documentId"), evidenceSnapshot: jsonb("evidenceSnapshot").$type<JsonValue>().notNull().default({}), createdAt: createdAt(),
}, t => [index("ConstructionMessage_caseId_createdAt_idx").on(t.caseId, t.createdAt)]);
export const constructionCompanyProfiles = pgTable("ConstructionCompanyProfile", {
  id: id(), companyId: text("companyId").notNull().unique(), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }).notNull(), isActive: boolean("isActive").notNull().default(true), legalReference: text("legalReference").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const constructionCompanyProfileEvents = pgTable("ConstructionCompanyProfileEvent", {
  id: id(), profileId: text("profileId").notNull().references(() => constructionCompanyProfiles.id, { onDelete: "restrict", onUpdate: "cascade" }), actorId: text("actorId").notNull(), before: jsonb("before").$type<JsonValue>().notNull(), after: jsonb("after").$type<JsonValue>().notNull(), createdAt: createdAt(),
}, t => [index("ConstructionCompanyProfileEvent_profileId_createdAt_idx").on(t.profileId, t.createdAt)]);
export const constructionProfessionalEmployers = pgTable("ConstructionProfessionalEmployer", {
  id: id(), professionalId: text("professionalId").notNull(), companyId: text("companyId").notNull(), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("ConstructionProfessionalEmployer_professionalId_companyId_startsAt_key").on(t.professionalId, t.companyId, t.startsAt)]);
export const constructionStaffRoles = pgTable("ConstructionStaffRole", {
  id: id(), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), role: text("role").notNull(), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("ConstructionStaffRole_employeeId_departmentId_role_startsAt_key").on(t.employeeId, t.departmentId, t.role, t.startsAt), index("ConstructionStaffRole_employeeId_isActive_startsAt_endsAt_idx").on(t.employeeId, t.isActive, t.startsAt, t.endsAt)]);
export const constructionExternalApplications = pgTable("ConstructionExternalApplication", {
  id: id(), requestKey: text("requestKey").notNull().unique(), identityId: text("identityId").notNull().references(() => constructionPortalIdentities.id, { onDelete: "restrict", onUpdate: "no action" }), personId: text("personId").references(() => people.id, { onDelete: "restrict", onUpdate: "no action" }), companyId: text("companyId").references(() => companies.id, { onDelete: "restrict", onUpdate: "no action" }), propertyIds: text("propertyIds").array().notNull(), subjectIds: text("subjectIds").array().notNull(), authorizationReason: text("authorizationReason").notNull(), authorizedBy: text("authorizedBy").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "no action" }), expiresAt: timestamp("expiresAt", { precision: 3 }).notNull(), revokedAt: timestamp("revokedAt", { precision: 3 }), revokedReason: text("revokedReason"), caseId: text("caseId").unique().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), createdAt: createdAt(),
}, t => [index("ConstructionExternalApplication_identityId_expiresAt_idx").on(t.identityId, t.expiresAt)]);
export const constructionServiceRequests = pgTable("ConstructionServiceRequest", {
  id: id(), requestKey: text("requestKey").notNull().unique(), caseId: text("caseId").notNull().references(() => constructionCases.id, { onDelete: "restrict", onUpdate: "no action" }), identityId: text("identityId").notNull().references(() => constructionPortalIdentities.id, { onDelete: "restrict", onUpdate: "no action" }), kind: text("kind").notNull(), status: text("status").notNull().default("PENDING"), revision: integer("revision").notNull(), notes: text("notes").notNull(), payload: jsonb("payload").$type<JsonValue>().notNull(), evidenceSnapshot: jsonb("evidenceSnapshot").$type<JsonValue>().notNull(), createdAt: createdAt(), resolvedAt: timestamp("resolvedAt", { precision: 3 }), resolvedBy: text("resolvedBy").references(() => users.id, { onDelete: "restrict", onUpdate: "no action" }), resolution: text("resolution"),
}, t => [index("ConstructionServiceRequest_caseId_status_createdAt_idx").on(t.caseId, t.status, t.createdAt), index("ConstructionServiceRequest_identityId_createdAt_idx").on(t.identityId, t.createdAt)]);
