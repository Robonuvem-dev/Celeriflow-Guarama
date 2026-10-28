import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const states = pgTable("State", {
  id: text("id").primaryKey().$defaultFn(createId), uf: text("uf").notNull(), ibgeCode: text("ibgeCode").notNull(), name: text("name").notNull(), status: text("status").notNull().default("ATIVO"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("State_uf_key").on(table.uf), uniqueIndex("State_ibgeCode_key").on(table.ibgeCode)]);

export const cities = pgTable("City", {
  id: text("id").primaryKey().$defaultFn(createId), stateId: text("stateId").notNull().references(() => states.id, { onDelete: "restrict", onUpdate: "cascade" }), ibgeCode: text("ibgeCode").notNull(), name: text("name").notNull(), status: text("status").notNull().default("ATIVA"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("City_ibgeCode_key").on(table.ibgeCode), uniqueIndex("City_stateId_name_key").on(table.stateId, table.name)]);

export const neighborhoods = pgTable("Neighborhood", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), type: text("type").notNull(), city: text("city").notNull(), state: text("state").notNull(),
  adminRegion: text("adminRegion"), notes: text("notes"), status: text("status").notNull().default("Ativo"), cityId: text("cityId").references(() => cities.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("Neighborhood_cityId_name_idx").on(table.cityId, table.name)]);

export const streets = pgTable("Street", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), type: text("type").notNull(), zipCode: text("zipCode"), city: text("city").notNull(), state: text("state").notNull(), status: text("status").notNull().default("Ativo"), cityId: text("cityId").references(() => cities.id, { onDelete: "restrict", onUpdate: "cascade" }), neighborhoodId: text("neighborhoodId").references(() => neighborhoods.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("Street_cityId_name_idx").on(table.cityId, table.name)]);
