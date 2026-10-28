import { date, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthProcedurePriceTables = pgTable("HealthProcedurePriceTable", {
  id: id(), unitId: text("unitId").notNull(), agreementId: text("agreementId"), code: text("code").notNull(), name: text("name").notNull(), version: integer("version").notNull(), validFrom: date("validFrom", { mode: "date" }).notNull(), validUntil: date("validUntil", { mode: "date" }).notNull(), sourceReference: text("sourceReference").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthProcedurePriceTable_unitId_code_version_key").on(t.unitId, t.code, t.version)]);
export const healthProcedurePriceItems = pgTable("HealthProcedurePriceItem", {
  id: id(), tableId: text("tableId").notNull(), procedureId: text("procedureId").notNull(), unitValue: exactNumeric("unitValue", { precision: 18, scale: 6 }).notNull(),
}, t => [uniqueIndex("HealthProcedurePriceItem_tableId_procedureId_key").on(t.tableId, t.procedureId)]);
export const healthProductionCompetences = pgTable("HealthProductionCompetence", {
  id: id(), period: text("period").notNull(), status: text("status").notNull().default("ABERTA"), openedAt: timestamp("openedAt", { precision: 3 }).notNull().defaultNow(), processedAt: timestamp("processedAt", { precision: 3 }), closedAt: timestamp("closedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthProductionCompetence_period_key").on(t.period)]);
export const healthProductionFacts = pgTable("HealthProductionFact", {
  id: id(), pricingSnapshot: jsonb("pricingSnapshot").$type<JsonValue>(), version: integer("version").notNull().default(1), originType: text("originType").notNull(), originId: text("originId").notNull(), patientId: text("patientId"), unitId: text("unitId"), professionalId: text("professionalId"), procedureId: text("procedureId"), quantity: integer("quantity").notNull().default(1), value: exactNumeric("value", { precision: 14, scale: 2 }), cidReferenceId: text("cidReferenceId"), municipality: text("municipality"), state: text("state"), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull(), period: text("period").notNull(), competenceId: text("competenceId"), status: text("status").notNull().default("VALIDO"), idempotencyKey: text("idempotencyKey").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthProductionFact_idempotencyKey_key").on(t.idempotencyKey)]);
export const healthProductionFactRevisions = pgTable("HealthProductionFactRevision", {
  id: id(), factId: text("factId").notNull(), version: integer("version").notNull(), before: jsonb("before").notNull(), after: jsonb("after").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthProductionFactRevision_factId_version_key").on(t.factId, t.version)]);
export const healthProductionCriticisms = pgTable("HealthProductionCriticism", {
  id: id(), factId: text("factId").notNull(), code: text("code").notNull(), message: text("message").notNull(), actionNeeded: text("actionNeeded"), status: text("status").notNull().default("ABERTA"), resolvedAt: timestamp("resolvedAt", { precision: 3 }), createdAt: createdAt(),
});
export const healthSusFiles = pgTable("HealthSusFile", {
  id: id(), fileType: text("fileType").notNull(), competenceId: text("competenceId").notNull(), unitId: text("unitId"), content: text("content").notNull(), hash: text("hash").notNull(), quantity: integer("quantity").notNull(), totalValue: exactNumeric("totalValue", { precision: 14, scale: 2 }), status: text("status").notNull().default("GERADO"), processedCount: integer("processedCount").notNull().default(0), rejectedCount: integer("rejectedCount").notNull().default(0), errors: jsonb("errors"), processedAt: timestamp("processedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthProductionTargets = pgTable("HealthProductionTarget", {
  id: id(), competenceId: text("competenceId").notNull(), procedureId: text("procedureId").notNull(), contractedQuantity: doublePrecision("contractedQuantity").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthProductionTarget_competenceId_procedureId_key").on(t.competenceId, t.procedureId)]);
export const healthUnitCeilings = pgTable("HealthUnitCeiling", {
  id: id(), unitId: text("unitId").notNull(), period: text("period").notNull(), value: exactNumeric("value", { precision: 14, scale: 2 }).notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthUnitCeiling_unitId_period_key").on(t.unitId, t.period)]);
