import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Runtime mappings; historical SQL guards/triggers remain authoritative.
const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const hrEmploymentContracts = pgTable("HrEmploymentContract", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), registration: text("registration").notNull().unique(),
  regimeId: text("regimeId").notNull(), roleId: text("roleId").notNull(), departmentId: text("departmentId"), costCenterId: text("costCenterId"), workLocation: text("workLocation").notNull(), salaryLevel: text("salaryLevel"),
  admittedAt: timestamp("admittedAt", { precision: 3 }).notNull(), appointedAt: timestamp("appointedAt", { precision: 3 }), swornAt: timestamp("swornAt", { precision: 3 }), endsAt: timestamp("endsAt", { precision: 3 }),
  monthlyHours: integer("monthlyHours").notNull().default(220), salary: exactNumeric("salary", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("ATIVO"), version: integer("version").notNull().default(1), details: jsonb("details").$type<JsonValue>().notNull(), ...timestamps(),
});
export const hrEmploymentRevisions = pgTable("HrEmploymentRevision", {
  id: text("id").primaryKey().$defaultFn(createId), contractId: text("contractId").notNull(), version: integer("version").notNull(), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull(),
  snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), actorId: text("actorId").notNull(), reason: text("reason").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("HrEmploymentRevision_contractId_version_key").on(t.contractId, t.version)]);
export const hrMovements = pgTable("HrMovement", {
  id: text("id").primaryKey().$defaultFn(createId), contractId: text("contractId").notNull(), sourceKey: text("sourceKey").notNull().unique(), rubricCode: text("rubricCode").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }),
  amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), reference: text("reference"), notes: text("notes").notNull(), actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const hrRightEntries = pgTable("HrRightEntry", {
  id: text("id").primaryKey().$defaultFn(createId), contractId: text("contractId").notNull(), sourceKey: text("sourceKey").notNull().unique(), kind: text("kind").notNull(), periodStart: timestamp("periodStart", { precision: 3 }).notNull(), periodEnd: timestamp("periodEnd", { precision: 3 }).notNull(),
  quantity: exactNumeric("quantity", { precision: 12, scale: 4 }).notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), details: jsonb("details").$type<JsonValue>().notNull(), actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const hrIntegrationEvents = pgTable("HrIntegrationEvent", {
  id: text("id").primaryKey().$defaultFn(createId), sourceKey: text("sourceKey").notNull().unique(), domain: text("domain").notNull(), environment: text("environment").notNull(), eventType: text("eventType").notNull(), status: text("status").notNull().default("AGUARDANDO_CONFIGURACAO"),
  payload: jsonb("payload").$type<JsonValue>().notNull(), payloadHash: text("payloadHash").notNull(), externalId: text("externalId"), result: jsonb("result").$type<JsonValue>(), attempts: integer("attempts").notNull().default(0), nextAttemptAt: timestamp("nextAttemptAt", { precision: 3 }), ...timestamps(),
});
export const hrPortalRequests = pgTable("HrPortalRequest", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), requestKey: text("requestKey").notNull().unique(), kind: text("kind").notNull(), status: text("status").notNull().default("EM_ANALISE"), payload: jsonb("payload").$type<JsonValue>().notNull(),
  decision: text("decision"), actorId: text("actorId").notNull(), decidedBy: text("decidedBy"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), decidedAt: timestamp("decidedAt", { precision: 3 }),
});
export const payrolls = pgTable("Payroll", {
  id: text("id").primaryKey().$defaultFn(createId), competence: text("competence").notNull(), type: text("type").notNull().default("Mensal"), status: text("status").notNull().default("Aberta"), totalValue: doublePrecision("totalValue").notNull().default(0), totalValueDecimal: exactNumeric("totalValueDecimal", { precision: 24, scale: 2 }), ...timestamps(),
});
export const payrollEvents = pgTable("PayrollEvent", {
  id: text("id").primaryKey().$defaultFn(createId), code: text("code").notNull().unique(), name: text("name").notNull(), type: text("type").notNull(), formula: text("formula"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
});
export const payrollItems = pgTable("PayrollItem", {
  id: text("id").primaryKey().$defaultFn(createId), payrollId: text("payrollId").notNull(), employeeId: text("employeeId").notNull(), eventId: text("eventId").notNull(), value: doublePrecision("value").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }), reference: text("reference"), ...timestamps(),
});
export const hrPayrollRuns = pgTable("HrPayrollRun", {
  id: text("id").primaryKey().$defaultFn(createId), payrollId: text("payrollId").notNull(), requestKey: text("requestKey").notNull().unique(), mode: text("mode").notNull(), scope: text("scope").notNull(), status: text("status").notNull().default("CALCULADA"), ruleSetId: text("ruleSetId").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
  gross: exactNumeric("gross", { precision: 18, scale: 2 }).notNull(), deductions: exactNumeric("deductions", { precision: 18, scale: 2 }).notNull(), net: exactNumeric("net", { precision: 18, scale: 2 }).notNull(), employer: exactNumeric("employer", { precision: 18, scale: 2 }).notNull(),
  actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), approvedAt: timestamp("approvedAt", { precision: 3 }), cancelledAt: timestamp("cancelledAt", { precision: 3 }),
});
export const hrPayrollStatements = pgTable("HrPayrollStatement", {
  id: text("id").primaryKey().$defaultFn(createId), runId: text("runId").notNull(), contractId: text("contractId").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
  gross: exactNumeric("gross", { precision: 18, scale: 2 }).notNull(), deductions: exactNumeric("deductions", { precision: 18, scale: 2 }).notNull(), net: exactNumeric("net", { precision: 18, scale: 2 }).notNull(), employer: exactNumeric("employer", { precision: 18, scale: 2 }).notNull(), releaseAt: timestamp("releaseAt", { precision: 3 }), revokedAt: timestamp("revokedAt", { precision: 3 }),
}, t => [uniqueIndex("HrPayrollStatement_runId_contractId_key").on(t.runId, t.contractId)]);
export const hrPayrollItemOrigins = pgTable("HrPayrollItemOrigin", {
  id: text("id").primaryKey().$defaultFn(createId), payrollItemId: text("payrollItemId").notNull().unique(), runId: text("runId").notNull(), statementId: text("statementId").notNull(), rubricCode: text("rubricCode").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("HrPayrollItemOrigin_statementId_rubricCode_key").on(t.statementId, t.rubricCode)]);
