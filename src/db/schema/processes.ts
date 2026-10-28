import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const processTypes = pgTable("ProcessType", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), description: text("description"), isActive: boolean("isActive").notNull().default(true), initialDepartmentId: text("initialDepartmentId"),
  defaultSlaDays: integer("defaultSlaDays"), defaultPriority: text("defaultPriority"), requiresInterested: boolean("requiresInterested").notNull().default(false), allowsInternalOpening: boolean("allowsInternalOpening").notNull().default(true), genericWorkflowEnabled: boolean("genericWorkflowEnabled").notNull().default(false),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const processSubjects = pgTable("Subject", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), description: text("description"), processTypeId: text("processTypeId").notNull(), slaDays: integer("slaDays"), isActive: boolean("isActive").notNull().default(true), initialDepartmentId: text("initialDepartmentId"),
  defaultPriority: text("defaultPriority"), requiresInterested: boolean("requiresInterested").notNull().default(false), allowsInternalOpening: boolean("allowsInternalOpening").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const processes = pgTable("Process", {
  id: text("id").primaryKey().$defaultFn(createId), protocolNumber: text("protocolNumber").notNull().unique(), status: text("status").notNull().default("Aberto"), description: text("description"), priority: text("priority").notNull().default("Normal"),
  processTypeId: text("processTypeId").notNull(), subjectId: text("subjectId").notNull(), personId: text("personId"), companyId: text("companyId"), currentDepartmentId: text("currentDepartmentId"), currentResponsibleEmployeeId: text("currentResponsibleEmployeeId"),
  expectedCompletionAt: timestamp("expectedCompletionAt", { precision: 3 }), receivedAt: timestamp("receivedAt", { precision: 3 }), completedAt: timestamp("completedAt", { precision: 3 }), archivedAt: timestamp("archivedAt", { precision: 3 }),
  archiveReason: text("archiveReason"), archivedByEmployeeId: text("archivedByEmployeeId"), currentWorkflowStageId: text("currentWorkflowStageId"), portalOrigin: text("portalOrigin"), portalPurpose: text("portalPurpose"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const processSequences = pgTable("ProcessSequence", {
  year: integer("year").primaryKey(), nextNumber: integer("nextNumber").notNull().default(1), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const processMovements = pgTable("ProcessMovement", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull(), fromDepartmentId: text("fromDepartmentId"), toDepartmentId: text("toDepartmentId").notNull(),
  employeeId: text("employeeId"), destinationEmployeeId: text("destinationEmployeeId"), receivedByEmployeeId: text("receivedByEmployeeId"), reason: text("reason"), status: text("status").notNull().default("AWAITING_RECEIPT"),
  receivedAt: timestamp("receivedAt", { precision: 3 }), dueAt: timestamp("dueAt", { precision: 3 }), movedAt: timestamp("movedAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
});
export const processEvents = pgTable("ProcessEvent", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull(), eventType: text("eventType").notNull(), description: text("description"), previousStatus: text("previousStatus"), newStatus: text("newStatus"), departmentId: text("departmentId"), employeeId: text("employeeId"), metadata: text("metadata"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const processDocuments = pgTable("ProcessDocument", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull(), title: text("title"), fileUrl: text("fileUrl"), documentType: text("documentType"), documentId: text("documentId"), purpose: text("purpose"), employeeId: text("employeeId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const processDispatches = pgTable("ProcessDispatch", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull(), content: text("content").notNull(), dispatchType: text("dispatchType").notNull().default("Despacho"), employeeId: text("employeeId").notNull(), departmentId: text("departmentId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const processWorkflowStages = pgTable("ProcessWorkflowStage", {
  id: text("id").primaryKey().$defaultFn(createId), processTypeId: text("processTypeId").notNull(), subjectId: text("subjectId"), departmentId: text("departmentId").notNull(), position: integer("position").notNull(), slaDays: integer("slaDays"), isActive: boolean("isActive").notNull().default(true), label: text("label"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("ProcessWorkflowStage_processTypeId_subjectId_position_key").on(t.processTypeId, t.subjectId, t.position)]);
export const genericWorkflowDefinitions = pgTable("GenericProcessWorkflowDefinition", {
  id: text("id").primaryKey().$defaultFn(createId), processTypeId: text("processTypeId").notNull(), version: integer("version").notNull(), status: text("status").notNull().default("DRAFT"), publishedAt: timestamp("publishedAt", { precision: 3 }), publishedByUsuarioId: text("publishedByUsuarioId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("GenericProcessWorkflowDefinition_processTypeId_version_key").on(t.processTypeId, t.version)]);
export const genericWorkflowStages = pgTable("GenericProcessWorkflowStage", {
  id: text("id").primaryKey().$defaultFn(createId), definitionId: text("definitionId").notNull(), position: integer("position").notNull(), label: text("label").notNull(), departmentId: text("departmentId").notNull(), slaCalendarDays: integer("slaCalendarDays").notNull(), requiresSignedDocument: boolean("requiresSignedDocument").notNull().default(false), requiredDocumentClassId: text("requiredDocumentClassId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("GenericProcessWorkflowStage_definitionId_position_key").on(t.definitionId, t.position)]);
export const genericWorkflowInstances = pgTable("GenericProcessWorkflowInstance", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull().unique(), definitionId: text("definitionId").notNull(), definitionVersion: integer("definitionVersion").notNull(), status: text("status").notNull().default("ACTIVE"), currentPosition: integer("currentPosition").notNull(), dueAt: timestamp("dueAt", { precision: 3 }), instanceTimeZone: text("instanceTimeZone").notNull(), openedByUsuarioId: text("openedByUsuarioId").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const genericWorkflowEvents = pgTable("GenericProcessWorkflowEvent", {
  id: text("id").primaryKey().$defaultFn(createId), instanceId: text("instanceId").notNull(), eventType: text("eventType").notNull(), fromPosition: integer("fromPosition"), toPosition: integer("toPosition"), actorUsuarioId: text("actorUsuarioId").notNull(), note: text("note"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
