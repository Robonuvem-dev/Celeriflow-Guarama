import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

export const hrConsignmentAgreements = pgTable("HrConsignmentAgreement", {
  id: text("id").primaryKey().$defaultFn(createId), sourceKey: text("sourceKey").notNull().unique(), contractId: text("contractId").notNull(), supplierId: text("supplierId").notNull(), sourceRunId: text("sourceRunId").notNull(), scope: text("scope").notNull(), number: text("number").notNull(), rubricCode: text("rubricCode").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("HrConsignmentAgreement_contractId_supplierId_number_scope_key").on(t.contractId, t.supplierId, t.number, t.scope)]);
export const hrConsignmentInstallments = pgTable("HrConsignmentInstallment", {
  id: text("id").primaryKey().$defaultFn(createId), agreementId: text("agreementId").notNull(), sequence: integer("sequence").notNull(), competenceAt: timestamp("competenceAt", { precision: 3 }).notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(),
}, t => [uniqueIndex("HrConsignmentInstallment_agreementId_sequence_key").on(t.agreementId, t.sequence), uniqueIndex("HrConsignmentInstallment_agreementId_competenceAt_key").on(t.agreementId, t.competenceAt)]);
export const hrConsignmentEntries = pgTable("HrConsignmentEntry", {
  id: text("id").primaryKey().$defaultFn(createId), installmentId: text("installmentId").notNull(), sourceKey: text("sourceKey").notNull().unique(), kind: text("kind").notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), movementId: text("movementId").unique(), reason: text("reason").notNull(), actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
