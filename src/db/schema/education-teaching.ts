import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const educationAttendances = pgTable("Attendance", {
  id: text("id").primaryKey().$defaultFn(createId), isPresent: boolean("isPresent").notNull().default(true), justification: text("justification"), absenceGroup: text("absenceGroup"),
  diaryId: text("diaryId").notNull(), studentId: text("studentId").notNull(), ...timestamps(),
});
export const educationAssessments = pgTable("EducationAssessment", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), stage: text("stage").notNull(), type: text("type").notNull(), evaluationMode: text("evaluationMode").notNull().default("Nota"),
  date: timestamp("date", { precision: 3 }).notNull(), maxScore: doublePrecision("maxScore"), averageScore: doublePrecision("averageScore"), content: text("content"), status: text("status").notNull().default("Rascunho"), publishedAt: timestamp("publishedAt", { precision: 3 }),
  classId: text("classId").notNull(), subjectId: text("subjectId").notNull(), teacherId: text("teacherId").notNull(), ...timestamps(),
});
export const educationGrades = pgTable("Grade", {
  id: text("id").primaryKey().$defaultFn(createId), period: text("period").notNull(), value: doublePrecision("value"), concept: text("concept"), type: text("type").notNull().default("AvaliaÃ§Ã£o"),
  absent: boolean("absent").notNull().default(false), recoveryValue: doublePrecision("recoveryValue"), feedback: text("feedback"), publishedAt: timestamp("publishedAt", { precision: 3 }),
  assessmentId: text("assessmentId"), classId: text("classId"), studentId: text("studentId").notNull(), subjectId: text("subjectId").notNull(), teacherId: text("teacherId").notNull(), ...timestamps(),
}, t => [uniqueIndex("Grade_assessmentId_studentId_key").on(t.assessmentId, t.studentId)]);
export const teacherAcademicRecords = pgTable("TeacherAcademicRecord", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull(), title: text("title").notNull(), stage: text("stage"), startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }),
  content: jsonb("content").$type<JsonValue>().notNull(), status: text("status").notNull().default("Rascunho"), publishedAt: timestamp("publishedAt", { precision: 3 }), pedagogicalFeedback: text("pedagogicalFeedback"),
  classId: text("classId").notNull(), subjectId: text("subjectId"), teacherId: text("teacherId").notNull(), ...timestamps(),
});
export const learningActivities = pgTable("LearningActivity", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), type: text("type").notNull(), instructions: text("instructions").notNull(), materialUrl: text("materialUrl"), dueAt: timestamp("dueAt", { precision: 3 }),
  status: text("status").notNull().default("Rascunho"), publishedAt: timestamp("publishedAt", { precision: 3 }), classId: text("classId").notNull(), subjectId: text("subjectId").notNull(), teacherId: text("teacherId").notNull(), ...timestamps(),
});
export const learningQuestions = pgTable("LearningQuestion", {
  id: text("id").primaryKey().$defaultFn(createId), statement: text("statement").notNull(), type: text("type").notNull().default("Discursiva"), options: jsonb("options").$type<JsonValue>(), answerKey: text("answerKey"),
  points: doublePrecision("points"), position: integer("position").notNull().default(1), activityId: text("activityId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const learningSubmissions = pgTable("LearningSubmission", {
  id: text("id").primaryKey().$defaultFn(createId), answer: text("answer"), attachmentUrl: text("attachmentUrl"), status: text("status").notNull().default("Entregue"), submittedAt: timestamp("submittedAt", { precision: 3 }).notNull().defaultNow(),
  score: doublePrecision("score"), feedback: text("feedback"), reviewedAt: timestamp("reviewedAt", { precision: 3 }), activityId: text("activityId").notNull(), studentId: text("studentId").notNull(), ...timestamps(),
}, t => [uniqueIndex("LearningSubmission_activityId_studentId_key").on(t.activityId, t.studentId)]);
