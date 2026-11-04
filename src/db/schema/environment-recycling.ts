import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { RecyclingMovementSnapshot } from "@/lib/environment/recycling-stock";

// Additive physical tables from 20261102120000_cf10_recycling_stock.
// SQL owns composite FKs, kind/arithmetic checks and immutable-history trigger.
export const recyclingMaterialBindings = pgTable("EnvRecyclingMaterialBinding", {
  instanceId: text("instanceId").notNull(), materialKey: text("materialKey").notNull(),
  typeKey: text("typeKey").notNull(), unitKey: text("unitKey").notNull(),
}, table => [primaryKey({ columns: [table.instanceId, table.materialKey] }), uniqueIndex("EnvRecyclingMaterialBinding_keys").on(table.instanceId, table.materialKey, table.typeKey, table.unitKey)]);

export const recyclingStocks = pgTable("EnvRecyclingStock", {
  instanceId: text("instanceId").notNull(), materialKey: text("materialKey").notNull(), depotKey: text("depotKey").notNull(),
  typeKey: text("typeKey").notNull(), unitKey: text("unitKey").notNull(),
  quantity: exactNumeric("quantity", { precision: 18, scale: 3 }).notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updatedAt", { precision: 3, withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.instanceId, table.materialKey, table.depotKey] }), index("EnvRecyclingStock_depot_idx").on(table.instanceId, table.depotKey)]);

export const recyclingMovements = pgTable("EnvRecyclingMovement", {
  id: text("id").primaryKey().$defaultFn(createId),
  instanceId: text("instanceId").notNull(), materialKey: text("materialKey").notNull(), depotKey: text("depotKey").notNull(),
  kind: text("kind").$type<"ENTRY" | "EXIT">().notNull(),
  quantity: exactNumeric("quantity", { precision: 18, scale: 3 }).notNull(),
  amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(),
  quantityBefore: exactNumeric("quantityBefore", { precision: 18, scale: 3 }).notNull(),
  quantityAfter: exactNumeric("quantityAfter", { precision: 18, scale: 3 }).notNull(),
  sequence: integer("sequence").notNull(), destinationKey: text("destinationKey"),
  origin: text("origin").notNull().default(""), notes: text("notes").notNull().default(""),
  snapshot: jsonb("snapshot").$type<RecyclingMovementSnapshot>().notNull(),
  occurredOn: date("occurredOn", { mode: "string" }).notNull(),
  actorUsuarioId: text("actorUsuarioId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), requestHash: text("requestHash").notNull(),
  createdAt: timestamp("createdAt", { precision: 3, withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("EnvRecyclingMovement_request").on(table.instanceId, table.idempotencyKey),
  uniqueIndex("EnvRecyclingMovement_sequence").on(table.instanceId, table.materialKey, table.depotKey, table.sequence),
  index("EnvRecyclingMovement_history_idx").on(table.instanceId, table.occurredOn, table.createdAt, table.id),
  index("EnvRecyclingMovement_stock_idx").on(table.instanceId, table.materialKey, table.depotKey, table.sequence),
]);
