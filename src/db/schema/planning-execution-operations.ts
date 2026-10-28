import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Decimal, exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

// Existing physical table, checked against the captured PostgreSQL catalog and
// historical SQL. This projection does not generate or execute DDL.
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
export const executionBenefitGrants = pgTable("TaxBenefitGrant", {
  id: text("id").primaryKey().$defaultFn(createId), ruleId: text("ruleId").notNull(), taxpayerId: text("taxpayerId").notNull(),
  sourceType: text("sourceType").notNull(), sourceId: text("sourceId").notNull(),
  originalAmountDecimal: money("originalAmountDecimal").notNull(), creditDecimal: money("creditDecimal").notNull().$defaultFn(() => new Decimal("0")),
  reductionDecimal: money("reductionDecimal").notNull().$defaultFn(() => new Decimal("0")), renunciationDecimal: money("renunciationDecimal").notNull().$defaultFn(() => new Decimal("0")),
  finalAmountDecimal: money("finalAmountDecimal").notNull(), status: text("status").notNull().default("CONCEDIDO"), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(),
  grantedByUsuarioId: text("grantedByUsuarioId").notNull(), grantedAt: timestamp("grantedAt", { precision: 3 }).notNull().defaultNow(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
