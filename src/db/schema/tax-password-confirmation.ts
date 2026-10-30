import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
export const taxPasswordPreferences = pgTable("TaxPasswordPreference", {
 userId:text("userId").primaryKey(),required:boolean("required").notNull().default(false),updatedAt:timestamp("updatedAt",{precision:3}).notNull().defaultNow(),
});
export const taxPasswordGrants = pgTable("TaxPasswordGrant", {
 id:text("id").primaryKey().$defaultFn(createId),userId:text("userId").notNull(),authTime:integer("authTime").notNull(),expiresAt:timestamp("expiresAt",{precision:3}).notNull(),consumedAt:timestamp("consumedAt",{precision:3}),
},t=>[uniqueIndex("TaxPasswordGrant_userId_authTime_key").on(t.userId,t.authTime)]);
