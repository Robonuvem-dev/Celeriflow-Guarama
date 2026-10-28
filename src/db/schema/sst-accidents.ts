import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const sstCats = pgTable("SstCat", {
  id: text("id").primaryKey(), budgetUnitId: text("budgetUnitId").notNull(), employeeId: text("employeeId").notNull(), createdById: text("createdById").notNull(),
  submissionKey: text("submissionKey").notNull(), requestHash: text("requestHash").notNull(), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull(),
  kind: text("kind").notNull(), source: text("source").notNull(), data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, string | null>>().notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("SstCat_budgetUnitId_submissionKey_key").on(t.budgetUnitId, t.submissionKey)]);

// This append-only table is defined in historical SQL, not in schema.prisma.
export const sstCatEvidence = pgTable("SstCatEvidence", {
  id: text("id").primaryKey(), catId: text("catId").notNull(), kind: text("kind").notNull(), version: integer("version").notNull(),
  clinical: boolean("clinical").notNull(), approved: boolean("approved").notNull().default(false), personId: text("personId"), professionalRoleId: text("professionalRoleId"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(), createdById: text("createdById").notNull(), submissionKey: text("submissionKey").notNull(), requestHash: text("requestHash").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("SstCatEvidence_submissionKey_key").on(t.submissionKey)]);
