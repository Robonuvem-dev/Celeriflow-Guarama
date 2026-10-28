import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Existing physical tables from the SQL history; this mapping does not apply DDL.
export const employeePortalRequests = pgTable("HrPortalRequest", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(),
  requestKey: text("requestKey").notNull().unique(), kind: text("kind").notNull(), status: text("status").notNull().default("EM_ANALISE"),
  payload: jsonb("payload").$type<JsonValue>().notNull(), decision: text("decision"), actorId: text("actorId").notNull(),
  decidedBy: text("decidedBy"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), decidedAt: timestamp("decidedAt", { precision: 3 }),
});
export const employeePortalServiceConfigurations = pgTable("HrPortalServiceConfiguration", {
  ruleId: text("ruleId").primaryKey(), publicServiceId: text("publicServiceId").notNull().unique(), budgetUnitId: text("budgetUnitId").notNull(),
  processTypeId: text("processTypeId").notNull(), subjectId: text("subjectId").notNull(), version: integer("version").notNull(), operation: text("operation").notNull(),
  snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const employeePortalRequestBindings = pgTable("HrPortalRequestBinding", {
  requestId: text("requestId").primaryKey(), processId: text("processId").notNull().unique(), serviceRuleId: text("serviceRuleId").notNull(),
  employeeId: text("employeeId").notNull(), actorId: text("actorId").notNull(), serviceVersion: integer("serviceVersion").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
