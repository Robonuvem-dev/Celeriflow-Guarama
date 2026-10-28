import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const supportChannels = pgTable("SupportChannel", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), description: text("description"), isActive: boolean("isActive").notNull().default(true), sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const serviceSubjects = pgTable("ServiceSubject", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull().unique(), description: text("description"), defaultDepartmentId: text("defaultDepartmentId"), defaultPriority: text("defaultPriority").notNull().default("Normal"), defaultDueDays: integer("defaultDueDays"), isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const tickets = pgTable("Ticket", {
  id: text("id").primaryKey().$defaultFn(createId), ticketNumber: text("ticketNumber").notNull().unique(), subject: text("subject").notNull(), description: text("description").notNull(), status: text("status").notNull().default("Aberto"), priority: text("priority").notNull().default("Normal"), isAnonymous: boolean("isAnonymous").notNull().default(false),
  dueAt: timestamp("dueAt", { precision: 3 }), resolvedAt: timestamp("resolvedAt", { precision: 3 }), solution: text("solution"), concludedAt: timestamp("concludedAt", { precision: 3 }),
  channelId: text("channelId").notNull(), personId: text("personId"), companyId: text("companyId"), departmentId: text("departmentId"), assigneeId: text("assigneeId"), serviceSubjectId: text("serviceSubjectId"), resolvedById: text("resolvedById"), concludedById: text("concludedById"), processId: text("processId").unique(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const ombudsmans = pgTable("Ombudsman", {
  id: text("id").primaryKey().$defaultFn(createId), protocolNumber: text("protocolNumber").notNull().unique(), type: text("type").notNull(), subject: text("subject").notNull(), description: text("description").notNull(), isAnonymous: boolean("isAnonymous").notNull().default(false), isConfidential: boolean("isConfidential").notNull().default(false), status: text("status").notNull().default("Recebida"),
  channelId: text("channelId").notNull(), personId: text("personId"), departmentId: text("departmentId"), assigneeId: text("assigneeId"), processId: text("processId").unique(), response: text("response"), respondedAt: timestamp("respondedAt", { precision: 3 }), respondedById: text("respondedById"), concludedAt: timestamp("concludedAt", { precision: 3 }), concludedById: text("concludedById"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const ticketInteractions = pgTable("TicketInteraction", {
  id: text("id").primaryKey().$defaultFn(createId), ticketId: text("ticketId").notNull(), message: text("message").notNull(), type: text("type").notNull().default("Registro"), isInternal: boolean("isInternal").notNull().default(false), employeeId: text("employeeId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ticketMovements = pgTable("TicketMovement", {
  id: text("id").primaryKey().$defaultFn(createId), ticketId: text("ticketId").notNull(), fromDepartmentId: text("fromDepartmentId"), toDepartmentId: text("toDepartmentId").notNull(), fromAssigneeId: text("fromAssigneeId"), toAssigneeId: text("toAssigneeId"), employeeId: text("employeeId").notNull(), reason: text("reason").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ticketAuditLogs = pgTable("TicketAuditLog", {
  id: text("id").primaryKey().$defaultFn(createId), ticketId: text("ticketId").notNull(), userId: text("userId").notNull(), employeeId: text("employeeId"), action: text("action").notNull(), details: jsonb("details"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ombudsmanAccessGrants = pgTable("OmbudsmanAccess", {
  id: text("id").primaryKey().$defaultFn(createId), ombudsmanId: text("ombudsmanId").notNull(), userId: text("userId").notNull(), grantedById: text("grantedById").notNull(), canViewIdentity: boolean("canViewIdentity").notNull().default(false), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("OmbudsmanAccess_ombudsmanId_userId_key").on(t.ombudsmanId, t.userId)]);
export const ombudsmanIdentities = pgTable("OmbudsmanIdentity", {
  id: text("id").primaryKey().$defaultFn(createId), ombudsmanId: text("ombudsmanId").notNull().unique(), personId: text("personId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ombudsmanMovements = pgTable("OmbudsmanMovement", {
  id: text("id").primaryKey().$defaultFn(createId), ombudsmanId: text("ombudsmanId").notNull(), fromDepartmentId: text("fromDepartmentId"), toDepartmentId: text("toDepartmentId").notNull(), employeeId: text("employeeId").notNull(), reason: text("reason").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ombudsmanInteractions = pgTable("OmbudsmanInteraction", {
  id: text("id").primaryKey().$defaultFn(createId), ombudsmanId: text("ombudsmanId").notNull(), type: text("type").notNull(), message: text("message").notNull(), isInternal: boolean("isInternal").notNull().default(true), employeeId: text("employeeId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ombudsmanAuditLogs = pgTable("OmbudsmanAuditLog", {
  id: text("id").primaryKey().$defaultFn(createId), ombudsmanId: text("ombudsmanId").notNull(), userId: text("userId").notNull(), employeeId: text("employeeId"), action: text("action").notNull(), details: jsonb("details"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const ticketDocuments = pgTable("TicketDocument", {
  id: text("id").primaryKey().$defaultFn(createId), ticketId: text("ticketId").notNull(), documentId: text("documentId").notNull(), employeeId: text("employeeId"), purpose: text("purpose"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("TicketDocument_ticketId_documentId_key").on(t.ticketId, t.documentId)]);
export const ombudsmanDocuments = pgTable("OmbudsmanDocument", {
  id: text("id").primaryKey().$defaultFn(createId), ombudsmanId: text("ombudsmanId").notNull(), documentId: text("documentId").notNull(), employeeId: text("employeeId"), purpose: text("purpose"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("OmbudsmanDocument_ombudsmanId_documentId_key").on(t.ombudsmanId, t.documentId)]);
