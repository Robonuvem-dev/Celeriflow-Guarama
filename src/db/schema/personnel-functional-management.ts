import { bigint, integer, jsonb, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { employees } from "./administration";
import { hrEmploymentContracts, hrPayrollRuns } from "./personnel-workforce";

/** Typed by functional-records.ts; revisions are retained in the integration ledger. */
export const hrFunctionalRecords = pgTable("HrFunctionalRecord", {
  id: text("id").primaryKey().$defaultFn(createId), kind: text("kind").notNull(),
  employeeId: text("employeeId").references(() => employees.id, { onDelete: "restrict" }),
  contractId: text("contractId").references(() => hrEmploymentContracts.id, { onDelete: "restrict" }),
  key: text("key").notNull(), name: text("name").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }),
  status: text("status").notNull().default("ATIVO"), version: integer("version").notNull().default(1),
  data: jsonb("data").$type<Record<string, string>>().notNull(), actorId: text("actorId").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("HrFunctionalRecord_key_key").on(t.key), index("HrFunctionalRecord_holder_period_idx").on(t.employeeId, t.kind, t.startsAt)]);

export const hrPersonalRevisions = pgTable("HrPersonalRevision", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(),
  effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
  actorId: text("actorId").notNull(), reason: text("reason").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("HrPersonalRevision_holder_effective_key").on(t.employeeId, t.effectiveFrom)]);

export const hrTimeCertificates = pgTable("HrTimeCertificate", {
  id: text("id").primaryKey().$defaultFn(createId), number: text("number").notNull().unique(),
  requestKey: text("requestKey").notNull().unique(), employeeId: text("employeeId").notNull().references(() => employees.id, { onDelete: "restrict" }),
  referenceDate: timestamp("referenceDate", { precision: 3 }).notNull(), issuer: text("issuer").notNull(), responsible: text("responsible").notNull(),
  purpose: text("purpose").notNull(), legalReference: text("legalReference").notNull(), actorId: text("actorId").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
  snapshotHash: text("snapshotHash").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});

export const hrRetirementAssessments = pgTable("HrRetirementAssessment", {
  id: text("id").primaryKey().$defaultFn(createId), number: text("number").notNull().unique(), requestKey: text("requestKey").notNull().unique(),
  employeeId: text("employeeId").notNull().references(() => employees.id, { onDelete: "restrict" }),
  contractId: text("contractId").notNull().references(() => hrEmploymentContracts.id, { onDelete: "restrict" }),
  referenceDate: timestamp("referenceDate", { precision: 3 }).notNull(), ruleId: text("ruleId").notNull(),
  issuer: text("issuer").notNull(), responsible: text("responsible").notNull(), legalReference: text("legalReference").notNull(), actorId: text("actorId").notNull(),
  amount: text("amount").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), snapshotHash: text("snapshotHash").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});

export const hrReferenceRevisions = pgTable("HrReferenceRevision", {
  sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
  id: text("id").primaryKey().$defaultFn(createId), referenceId: text("referenceId").notNull(), kind: text("kind").notNull(),
  operation: text("operation").notNull(), beforeValue: jsonb("beforeValue").$type<JsonValue>(), afterValue: jsonb("afterValue").$type<JsonValue>(),
  actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("HrReferenceRevision_reference_created_idx").on(t.referenceId, t.createdAt)]);

export const hrPayrollAccountingEvidence = pgTable("HrPayrollAccountingEvidence", {
  id: text("id").primaryKey().$defaultFn(createId), runId: text("runId").notNull().unique().references(() => hrPayrollRuns.id, { onDelete: "restrict" }),
  requestKey: text("requestKey").notNull().unique(), source: text("source").notNull(), responsible: text("responsible").notNull(), reason: text("reason").notNull(), actorId: text("actorId").notNull(),
  snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), snapshotHash: text("snapshotHash").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
