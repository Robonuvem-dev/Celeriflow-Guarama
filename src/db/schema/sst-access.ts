import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const sstAccessGrants = pgTable("SstAccessGrant", {
  id: text("id").primaryKey().$defaultFn(createId), usuarioId: text("usuarioId").notNull(), budgetUnitId: text("budgetUnitId").notNull(),
  canReadClinical: boolean("canReadClinical").notNull().default(false), canAssess: boolean("canAssess").notNull().default(false), isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("SstAccessGrant_usuarioId_budgetUnitId_key").on(t.usuarioId, t.budgetUnitId)]);
export const sstDisciplineGrants = pgTable("SstDisciplineGrant", {
  id: text("id").primaryKey().$defaultFn(createId), usuarioId: text("usuarioId").notNull(), budgetUnitId: text("budgetUnitId").notNull(), discipline: text("discipline").notNull(),
  canRead: boolean("canRead").notNull().default(false), canWrite: boolean("canWrite").notNull().default(false), isActive: boolean("isActive").notNull().default(true),
}, t => [uniqueIndex("SstDisciplineGrant_usuarioId_budgetUnitId_discipline_key").on(t.usuarioId, t.budgetUnitId, t.discipline)]);
