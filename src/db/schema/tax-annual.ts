import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

// Runtime mappings only. Authority: installed catalog (2026-10-28) and the
// historical SQL, including 20261014110000_tax_annual_batches. No generated DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const annualBatches = pgTable("TaxAnnualBatch", {
  id: id(), governmentEntityId: text("governmentEntityId").notNull(), budgetUnitId: text("budgetUnitId").notNull(), financialYearId: text("financialYearId").notNull(),
  taxId: text("taxId").notNull(), parameterId: text("parameterId").notNull(), year: integer("year").notNull(), competence: timestamp("competence", { precision: 3 }).notNull(),
  targetType: text("targetType").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), requestHash: text("requestHash").notNull(), ruleSnapshot: jsonb("ruleSnapshot").$type<JsonValue>().notNull(),
  status: text("status").notNull().default("SIMULATED"), reason: text("reason").notNull(), scheduledAt: timestamp("scheduledAt", { precision: 3 }), queuedAt: timestamp("queuedAt", { precision: 3 }), completedAt: timestamp("completedAt", { precision: 3 }), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const annualBatchItems = pgTable("TaxAnnualBatchItem", {
  id: id(), batchId: text("batchId").notNull(), targetId: text("targetId").notNull(), taxpayerId: text("taxpayerId").notNull(),
  taxableBase: exactNumeric("taxableBase", { precision: 24, scale: 2 }).notNull(), simulatedAmount: exactNumeric("simulatedAmount", { precision: 24, scale: 2 }).notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
  status: text("status").notNull().default("PENDING"), attempts: integer("attempts").notNull().default(0), assessmentId: text("assessmentId"), error: text("error"), completedAt: timestamp("completedAt", { precision: 3 }), createdAt: createdAt(), updatedAt: updatedAt(),
});

// Read-only projection; the summary does not mutate grants or their rules.
export const annualBenefitGrants = pgTable("TaxBenefitGrant", {
  id: text("id").notNull(), ruleId: text("ruleId").notNull(), status: text("status").notNull(),
  originalAmountDecimal: exactNumeric("originalAmountDecimal", { precision: 18, scale: 2 }).notNull(), finalAmountDecimal: exactNumeric("finalAmountDecimal", { precision: 18, scale: 2 }).notNull(),
});
