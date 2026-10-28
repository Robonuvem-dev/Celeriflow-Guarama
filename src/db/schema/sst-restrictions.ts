import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const sstRestrictions = pgTable("SstRestriction", {
  id: text("id").primaryKey(), budgetUnitId: text("budgetUnitId").notNull(), employeeId: text("employeeId").notNull(), professionalRoleId: text("professionalRoleId").notNull(),
  startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdById: text("createdById").notNull(), submissionKey: text("submissionKey").notNull(), requestHash: text("requestHash").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("SstRestriction_submissionKey_key").on(t.submissionKey)]);
export const sstRestrictionFollowups = pgTable("SstRestrictionFollowup", {
  id: text("id").primaryKey(), restrictionId: text("restrictionId").notNull(), followedAt: timestamp("followedAt", { precision: 3 }).notNull(), data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdById: text("createdById").notNull(), submissionKey: text("submissionKey").notNull(), requestHash: text("requestHash").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("SstRestrictionFollowup_submissionKey_key").on(t.submissionKey)]);
