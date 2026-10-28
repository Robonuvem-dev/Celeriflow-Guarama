import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { taxpayers } from "./registry";
import { actionTaxCertificates } from "./tax-actions";

// Complete installed mapping, checked against the independent catalog and the
// historical baseline. These declarations never generate or apply DDL.
export const taxCertificateEvaluations = pgTable("TaxCertificateEvaluation", {
  id: text("id").primaryKey().$defaultFn(createId),
  taxpayerId: text("taxpayerId").notNull(), certificateId: text("certificateId"), result: text("result").notNull(),
  pendingCount: integer("pendingCount").notNull().default(0), details: jsonb("details").$type<JsonValue>().notNull(),
  evaluatedAt: timestamp("evaluatedAt", { precision: 3 }).notNull().defaultNow(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [
  uniqueIndex("TaxCertificateEvaluation_certificateId_key").on(table.certificateId),
  index("TaxCertificateEvaluation_taxpayerId_evaluatedAt_idx").on(table.taxpayerId, table.evaluatedAt),
  foreignKey({ name: "TaxCertificateEvaluation_taxpayerId_fkey", columns: [table.taxpayerId], foreignColumns: [taxpayers.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "TaxCertificateEvaluation_certificateId_fkey", columns: [table.certificateId], foreignColumns: [actionTaxCertificates.id] }).onDelete("set null").onUpdate("cascade"),
]);
