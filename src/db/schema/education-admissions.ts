import { doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const preEnrollmentProcesses = pgTable("PreEnrollmentProcess", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), year: integer("year").notNull(), stage: text("stage").notNull(), shift: text("shift"), capacity: integer("capacity").notNull(),
  startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }).notNull(), status: text("status").notNull().default("Planejado"), criteria: jsonb("criteria").$type<JsonValue>(), schoolId: text("schoolId").notNull(), ...timestamps(),
});
export const preEnrollments = pgTable("PreEnrollment", {
  id: text("id").primaryKey().$defaultFn(createId), year: integer("year").notNull(), stage: text("stage").notNull(), grade: text("grade").notNull(), shift: text("shift").notNull(), status: text("status").notNull().default("Pendente"),
  protocol: text("protocol"), rankingScore: doublePrecision("rankingScore").notNull().default(0), position: integer("position"), history: jsonb("history").$type<JsonValue>(), allocatedAt: timestamp("allocatedAt", { precision: 3 }), canceledAt: timestamp("canceledAt", { precision: 3 }),
  processId: text("processId"), studentId: text("studentId").notNull(), schoolId: text("schoolId").notNull(), ...timestamps(),
}, t => [uniqueIndex("PreEnrollment_protocol_key").on(t.protocol)]);
export const academicDocumentIssues = pgTable("AcademicDocumentIssue", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull(), fileName: text("fileName").notNull(), filters: jsonb("filters").$type<JsonValue>(), generatedContent: text("generatedContent").notNull(), actorName: text("actorName").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), studentId: text("studentId"),
});
