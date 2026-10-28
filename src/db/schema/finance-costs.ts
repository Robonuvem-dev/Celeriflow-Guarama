import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

const identity = () => ({ id: text("id").primaryKey().$defaultFn(createId), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow() });

export const municipalCostPolicies = pgTable("MunicipalCostPolicy", {
  ...identity(), governmentEntityId: text("governmentEntityId").notNull(), effectiveFrom: date("effectiveFrom", { mode: "date" }).notNull(), enabled: boolean("enabled").notNull(),
  sourceTypes: jsonb("sourceTypes").$type<JsonValue>().notNull(), reason: text("reason").notNull(), actorId: text("actorId").notNull(),
}, table => [index("MunicipalCostPolicy_scope").on(table.governmentEntityId, table.effectiveFrom, table.createdAt)]);

export const municipalCostObjects = pgTable("MunicipalCostObject", {
  ...identity(), financialYearId: text("financialYearId").notNull(), budgetUnitId: text("budgetUnitId"), code: text("code").notNull(), description: text("description").notNull(),
  detailedDescription: text("detailedDescription").notNull(), parentId: text("parentId"), sourceKey: text("sourceKey").notNull(), sourceSnapshot: jsonb("sourceSnapshot").$type<JsonValue>().notNull(), isActive: boolean("isActive").notNull().default(true),
}, table => [uniqueIndex("MunicipalCostObject_financialYearId_code_key").on(table.financialYearId, table.code), uniqueIndex("MunicipalCostObject_financialYearId_sourceKey_key").on(table.financialYearId, table.sourceKey), index("MunicipalCostObject_scope").on(table.financialYearId, table.budgetUnitId, table.parentId)]);

export const municipalCostItems = pgTable("MunicipalCostItem", {
  ...identity(), financialYearId: text("financialYearId").notNull(), identifier: text("identifier").notNull(), description: text("description").notNull(), detailedDescription: text("detailedDescription").notNull(),
  identificationClass: text("identificationClass").notNull(), behavior: text("behavior").notNull(), isActive: boolean("isActive").notNull().default(true),
}, table => [uniqueIndex("MunicipalCostItem_financialYearId_identifier_key").on(table.financialYearId, table.identifier)]);

export const municipalCostObjectItems = pgTable("MunicipalCostObjectItem", {
  ...identity(), objectId: text("objectId").notNull(), itemId: text("itemId").notNull(), copiedFromId: text("copiedFromId"),
}, table => [uniqueIndex("MunicipalCostObjectItem_objectId_itemId_key").on(table.objectId, table.itemId)]);

export const municipalCostRules = pgTable("MunicipalCostRule", {
  ...identity(), financialYearId: text("financialYearId").notNull(), budgetUnitId: text("budgetUnitId").notNull(), title: text("title").notNull(), sourceType: text("sourceType").notNull(),
  selector: jsonb("selector").$type<JsonValue>().notNull(), shares: jsonb("shares").$type<JsonValue>().notNull(), priority: integer("priority").notNull().default(0),
  effectiveFrom: date("effectiveFrom", { mode: "date" }).notNull(), effectiveUntil: date("effectiveUntil", { mode: "date" }), isActive: boolean("isActive").notNull().default(true),
  retiredAt: timestamp("retiredAt", { precision: 3 }), retirementReason: text("retirementReason"), actorId: text("actorId").notNull(),
}, table => [index("MunicipalCostRule_scope").on(table.financialYearId, table.budgetUnitId, table.sourceType, table.effectiveFrom)]);

export const municipalCostSources = pgTable("MunicipalCostSource", {
  ...identity(), financialYearId: text("financialYearId").notNull(), budgetUnitId: text("budgetUnitId").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId").notNull(),
  expenseDate: timestamp("expenseDate", { precision: 3 }).notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("ACTIVE"), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
}, table => [uniqueIndex("MunicipalCostSource_sourceType_sourceId_key").on(table.sourceType, table.sourceId), index("MunicipalCostSource_scope").on(table.financialYearId, table.budgetUnitId, table.expenseDate)]);

export const municipalCostSourceReductions = pgTable("MunicipalCostSourceReduction", {
  ...identity(), sourceId: text("sourceId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(),
  reason: text("reason").notNull(), actorId: text("actorId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
}, table => [uniqueIndex("MunicipalCostSourceReduction_idempotencyKey_key").on(table.idempotencyKey), index("MunicipalCostSourceReduction_sourceId_date_idx").on(table.sourceId, table.date)]);

export const municipalCostMovements = pgTable("MunicipalCostMovement", {
  ...identity(), sourceId: text("sourceId").notNull(), kind: text("kind").notNull(), date: timestamp("date", { precision: 3 }).notNull(), reason: text("reason").notNull(),
  actorId: text("actorId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), referenceMovementId: text("referenceMovementId"), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
}, table => [uniqueIndex("MunicipalCostMovement_idempotencyKey_key").on(table.idempotencyKey), uniqueIndex("MunicipalCostMovement_referenceMovementId_key").on(table.referenceMovementId), index("MunicipalCostMovement_source").on(table.sourceId, table.date)]);

export const municipalCostAllocations = pgTable("MunicipalCostAllocation", {
  id: text("id").primaryKey().$defaultFn(createId), movementId: text("movementId").notNull(), objectId: text("objectId").notNull(), itemId: text("itemId").notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(),
}, table => [uniqueIndex("MunicipalCostAllocation_movementId_objectId_itemId_key").on(table.movementId, table.objectId, table.itemId)]);
