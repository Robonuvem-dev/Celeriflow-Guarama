import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { users } from "./identity";

export const healthUserAccessScopes = pgTable("HealthUserAccessScope", {
  id: text("id").primaryKey().$defaultFn(createId),
  usuarioId: text("usuarioId").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  unitId: text("unitId").notNull(),
  validFrom: text("validFrom"),
  validUntil: text("validUntil"),
  weekdays: text("weekdays").notNull(),
  startTime: text("startTime").notNull(),
  endTime: text("endTime").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [
  uniqueIndex("HealthUserAccessScope_usuarioId_unitId_key").on(table.usuarioId, table.unitId),
  index("HealthUserAccessScope_unitId_isActive_idx").on(table.unitId, table.isActive),
  index("HealthUserAccessScope_usuarioId_isActive_idx").on(table.usuarioId, table.isActive),
]);
