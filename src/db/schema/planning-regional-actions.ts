import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { planningActions } from "./planning-legal";
import { users } from "./identity";
export const planningRegionalActions = pgTable("PlanningRegionalAction", {
  id: text("id").primaryKey().$defaultFn(createId), actionId: text("actionId").notNull().references(() => planningActions.id),
  region: text("region").notNull(), subactionCode: text("subactionCode").notNull().default(""), name: text("name").notNull(), active: boolean("active").notNull().default(true),
  createdByUsuarioId: text("createdByUsuarioId").notNull().references(() => users.id), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("PlanningRegionalAction_action_region_code_key").on(t.actionId, t.region, t.subactionCode)]);
