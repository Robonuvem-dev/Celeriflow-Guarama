import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const dates = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const publicServices = pgTable("PublicService", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), description: text("description").notNull(), target: text("target").notNull(), requirements: text("requirements"), steps: text("steps"), deadline: text("deadline"), cost: text("cost"), linkUrl: text("linkUrl"), isActive: boolean("isActive").notNull().default(true), ...dates(),
});
export const portalServiceConfigurations = pgTable("PortalServiceConfiguration", {
  id: text("id").primaryKey().$defaultFn(createId), publicServiceId: text("publicServiceId").notNull().unique(), slug: text("slug").notNull().unique(), group: text("group").notNull(), provider: text("provider").notNull(), audience: text("audience").notNull().default("CIDADAO"), requiresLogin: boolean("requiresLogin").notNull().default(true), published: boolean("published").notNull().default(false), featured: boolean("featured").notNull().default(false), sortOrder: integer("sortOrder").notNull().default(0), version: integer("version").notNull().default(1), configuration: jsonb("configuration").notNull(), ...dates(),
});
export const portalServiceVersions = pgTable("PortalServiceVersion", {
  id: text("id").primaryKey().$defaultFn(createId), serviceId: text("serviceId").notNull(), version: integer("version").notNull(), snapshot: jsonb("snapshot").notNull(), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("PortalServiceVersion_serviceId_version_key").on(t.serviceId, t.version)]);
export const portalServiceRequests = pgTable("PortalServiceRequest", {
  id: text("id").primaryKey().$defaultFn(createId), serviceId: text("serviceId").notNull(), serviceVersion: integer("serviceVersion").notNull(), snapshot: jsonb("snapshot").notNull(), actorId: text("actorId").notNull(), taxpayerId: text("taxpayerId"), processId: text("processId").notNull().unique(), worksServiceId: text("worksServiceId").unique(), executorType: text("executorType").notNull().default("SOLICITACAO"), executorId: text("executorId"), requestKey: text("requestKey").notNull(), inputHash: text("inputHash").notNull(), payload: jsonb("payload").notNull(), status: text("status").notNull().default("RECEBIDO"), revision: integer("revision").notNull().default(1), pendingDocumentCodes: jsonb("pendingDocumentCodes").notNull().default([]), ...dates(),
}, t => [uniqueIndex("PortalServiceRequest_actorId_requestKey_key").on(t.actorId, t.requestKey)]);
export const portalServiceRequestEvents = pgTable("PortalServiceRequestEvent", {
  id: text("id").primaryKey().$defaultFn(createId), requestId: text("requestId").notNull(), actorId: text("actorId").notNull(), kind: text("kind").notNull(), text: text("text").notNull(), requestKey: text("requestKey").notNull(), inputHash: text("inputHash").notNull().default(""), visible: boolean("visible").notNull().default(true), documentVersionId: text("documentVersionId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("PortalServiceRequestEvent_requestId_requestKey_key").on(t.requestId, t.requestKey)]);
export const portalServiceUploads = pgTable("PortalServiceUpload", {
  id: text("id").primaryKey().$defaultFn(createId), ownerId: text("ownerId").notNull(), serviceId: text("serviceId").notNull(), serviceVersion: integer("serviceVersion").notNull(), code: text("code").notNull(), documentId: text("documentId").notNull().unique(), documentVersionId: text("documentVersionId").notNull().unique(), filename: text("filename").notNull(), pathname: text("pathname").notNull().unique(), requestId: text("requestId"), targetRequestId: text("targetRequestId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const portalServiceFavorites = pgTable("PortalServiceFavorite", {
  id: text("id").primaryKey().$defaultFn(createId), actorId: text("actorId").notNull(), publicServiceId: text("publicServiceId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("PortalServiceFavorite_actorId_publicServiceId_key").on(t.actorId, t.publicServiceId)]);
export const portalServiceRatings = pgTable("PortalServiceRating", {
  id: text("id").primaryKey().$defaultFn(createId), requestId: text("requestId").notNull().unique(), serviceScore: integer("serviceScore").notNull(), qualityScore: integer("qualityScore").notNull(), deadlineScore: integer("deadlineScore").notNull(), comment: text("comment").notNull(), ...dates(),
});
export const portalServiceNotices = pgTable("PortalServiceNotice", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), text: text("text").notNull(), audience: text("audience").notNull().default("PUBLICO"), popup: boolean("popup").notNull().default(false), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), active: boolean("active").notNull().default(true), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const portalServiceSchedules = pgTable("PortalServiceSchedule", {
  id: text("id").primaryKey().$defaultFn(createId), resourceKey: text("resourceKey").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), type: text("type").notNull(), reason: text("reason").notNull(), status: text("status").notNull().default("PROGRAMADO"), employeeId: text("employeeId"), teamId: text("teamId"), assetId: text("assetId"), laborQuantity: numeric("laborQuantity", { precision: 12, scale: 2 }).notNull().default("0"), laborUnitCost: numeric("laborUnitCost", { precision: 18, scale: 2 }).notNull().default("0"), realizedQuantity: numeric("realizedQuantity", { precision: 12, scale: 2 }).notNull().default("0"), createdById: text("createdById").notNull(), ...dates(),
});
export const portalScheduleRequests = pgTable("PortalScheduleRequest", {
  id: text("id").primaryKey().$defaultFn(createId), scheduleId: text("scheduleId").notNull(), requestId: text("requestId").notNull(),
}, t => [uniqueIndex("PortalScheduleRequest_scheduleId_requestId_key").on(t.scheduleId, t.requestId)]);

/** Portal-owned access to fiscal requests; DDL remains in authoritative SQL. */
export const portalTaxServiceRequests = pgTable("TaxServiceRequest", {
  id: text("id").primaryKey().$defaultFn(createId), serviceType: text("serviceType").notNull(), status: text("status").notNull().default("EM_ANALISE_INTERNA"), taxpayerId: text("taxpayerId").notNull(), processId: text("processId"), documentId: text("documentId"), assessmentId: text("assessmentId"), licenseId: text("licenseId"), notes: text("notes"), ...dates(),
});
