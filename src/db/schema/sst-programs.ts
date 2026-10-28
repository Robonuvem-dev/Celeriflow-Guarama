import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@/db/ids";
import type { JsonValue } from "@/db/json";

export const sstExposureGroups = pgTable("SstExposureGroup", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), code: text("code").notNull(), name: text("name").notNull(),
  departmentIds: text("departmentIds").array().default([]), roleIds: text("roleIds").array().default([]), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }),
  isActive: boolean("isActive").notNull().default(true), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("SstExposureGroup_budgetUnitId_code_key").on(t.budgetUnitId, t.code)]);
export const sstPrograms = pgTable("SstOccupationalProgram", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), code: text("code").notNull(), kind: text("kind").notNull(), version: integer("version").notNull(),
  startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), responsiblePersonId: text("responsiblePersonId").notNull(), responsibleCouncil: text("responsibleCouncil").notNull(),
  responsibleSnapshot: jsonb("responsibleSnapshot").$type<JsonValue>().notNull(), content: jsonb("content").$type<JsonValue>().notNull(), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("SstOccupationalProgram_budgetUnitId_code_kind_version_key").on(t.budgetUnitId, t.code, t.kind, t.version)]);
export const sstProgramGroups = pgTable("SstProgramExposureGroup", {
  id: text("id").primaryKey().$defaultFn(createId), programId: text("programId").notNull(), groupId: text("groupId").notNull(), groupSnapshot: jsonb("groupSnapshot").$type<JsonValue>().notNull(), risks: jsonb("risks").$type<JsonValue>().notNull(), exams: jsonb("exams").$type<JsonValue>().notNull(),
}, t => [uniqueIndex("SstProgramExposureGroup_programId_groupId_key").on(t.programId, t.groupId)]);
