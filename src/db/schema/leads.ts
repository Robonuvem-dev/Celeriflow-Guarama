import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const leads = pgTable("Lead", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(), role: text("role"), organization: text("organization").notNull(),
  city: text("city").notNull(), state: text("state").notNull(), email: text("email").notNull(),
  phone: text("phone"), moduleInterest: text("moduleInterest"), message: text("message"), consent: boolean("consent").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
