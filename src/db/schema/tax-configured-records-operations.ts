import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";

// Read/update projections of installed tables. Historical SQL owns the DDL.
export const configuredEntityUnits = pgTable("PlanningEntityUnit", {
  budgetUnitId: text("budgetUnitId").primaryKey(), governmentEntityId: text("governmentEntityId").notNull(),
});
export const configuredNeighborhoods = pgTable("Neighborhood", { id: text("id").primaryKey() });
export const configuredStreets = pgTable("Street", { id: text("id").primaryKey() });
export const configuredProperties = pgTable("RealEstate", {
  id: text("id").primaryKey(), status: text("status").notNull(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$onUpdateFn(() => new Date()),
});
export const configuredEconomicRegistrations = pgTable("EconomicRegistration", { id: text("id").primaryKey() });
export const configuredItbiDeclarations = pgTable("ItbiDeclaration", {
  id: text("id").primaryKey(), calculationSnapshot: jsonb("calculationSnapshot").$type<JsonValue>().notNull(),
});
export const configuredProcesses = pgTable("Process", { id: text("id").primaryKey() });
export const configuredDocuments = pgTable("Document", { id: text("id").primaryKey(), status: text("status").notNull() });
