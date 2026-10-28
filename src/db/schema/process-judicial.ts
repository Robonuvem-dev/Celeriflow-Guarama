import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const processJudicialCases = pgTable("ProcessJudicialCase", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull().unique(), governmentEntityId: text("governmentEntityId").notNull(), budgetUnitId: text("budgetUnitId").notNull(), caseNumber: text("caseNumber").notNull(), court: text("court").notNull(), openedAt: timestamp("openedAt", { precision: 3 }).notNull(), status: text("status").notNull().default("OPEN"), version: integer("version").notNull().default(1), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("ProcessJudicialCase_governmentEntityId_caseNumber_key").on(t.governmentEntityId, t.caseNumber)]);
export const processJudicialCaseEvents = pgTable("ProcessJudicialCaseEvent", {
  id: text("id").primaryKey().$defaultFn(createId), caseId: text("caseId").notNull(), version: integer("version").notNull(), status: text("status").notNull(), effectiveAt: timestamp("effectiveAt", { precision: 3 }).notNull(), reason: text("reason").notNull(), documentVersionId: text("documentVersionId").notNull(), documentHash: text("documentHash").notNull(), snapshot: jsonb("snapshot").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), idempotencyKey: text("idempotencyKey").notNull().unique(), requestHash: text("requestHash").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ProcessJudicialCaseEvent_caseId_version_key").on(t.caseId, t.version)]);

/** Read-only fiscal ownership projections; no new migration/DDL. */
export const judicialBudgetUnits = pgTable("BudgetUnit", { id: text("id").primaryKey(), secretariatId: text("secretariatId").notNull(), code: text("code").notNull(), name: text("name").notNull() });
export const judicialGovernmentEntities = pgTable("GovernmentEntity", { id: text("id").primaryKey(), name: text("name").notNull() });
