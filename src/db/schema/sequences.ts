import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const sequenceCounters = pgTable("SequenceCounter", {
  id: text("id").primaryKey().$defaultFn(createId),
  key: text("key").notNull(),
  value: integer("value").notNull().default(0),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("SequenceCounter_key_key").on(table.key)]);
