import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

// Runtime mappings of existing tables only; this file does not establish DDL authority.
const timestamps = () => ({
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const schools = pgTable("School", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(),
  inepCode: text("inepCode"), cnpj: text("cnpj"), phone: text("phone"), email: text("email"),
  capacity: integer("capacity").notNull().default(0), isActive: boolean("isActive").notNull().default(true),
  directorId: text("directorId"), addressId: text("addressId"), realEstateId: text("realEstateId"), ...timestamps(),
}, t => [uniqueIndex("School_inepCode_key").on(t.inepCode), uniqueIndex("School_addressId_key").on(t.addressId)]);
export const students = pgTable("Student", {
  id: text("id").primaryKey().$defaultFn(createId), studentCode: text("studentCode").notNull(),
  specialNeeds: text("specialNeeds"), dietaryRestrictions: text("dietaryRestrictions"), usesSchoolTransport: boolean("usesSchoolTransport").notNull().default(false),
  needsSpecialMeal: boolean("needsSpecialMeal").notNull().default(false), status: text("status").notNull().default("Ativo"),
  personId: text("personId").notNull(), ...timestamps(),
}, t => [uniqueIndex("Student_studentCode_key").on(t.studentCode), uniqueIndex("Student_personId_key").on(t.personId)]);
export const educationalGuardians = pgTable("EducationalGuardian", {
  id: text("id").primaryKey().$defaultFn(createId), kinship: text("kinship").notNull(),
  isFinancial: boolean("isFinancial").notNull().default(false), isAcademic: boolean("isAcademic").notNull().default(true),
  canPickUp: boolean("canPickUp").notNull().default(true), studentId: text("studentId").notNull(), personId: text("personId").notNull(), ...timestamps(),
});
export const teachers = pgTable("Teacher", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), ...timestamps(),
}, t => [uniqueIndex("Teacher_employeeId_key").on(t.employeeId)]);
export const academicPeriods = pgTable("AcademicPeriod", {
  id: text("id").primaryKey().$defaultFn(createId), code: text("code").notNull(), name: text("name").notNull(),
  year: integer("year").notNull(), modality: text("modality").notNull(),
  startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }).notNull(),
  status: text("status").notNull().default("Planejado"), resolution: text("resolution"), useHours: boolean("useHours").notNull().default(true),
  minimumSchoolDays: integer("minimumSchoolDays").notNull().default(200), settings: jsonb("settings").$type<JsonValue>(),
  schoolId: text("schoolId").notNull(), ...timestamps(),
}, t => [uniqueIndex("AcademicPeriod_schoolId_code_key").on(t.schoolId, t.code)]);
export const schoolSubjects = pgTable("SchoolSubject", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), code: text("code"),
  description: text("description"), abbreviation: text("abbreviation"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("SchoolSubject_code_key").on(t.code)]);
export const curriculumMatrices = pgTable("CurriculumMatrix", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), stage: text("stage").notNull(), grade: text("grade").notNull(),
  version: integer("version").notNull().default(1), annualWorkload: integer("annualWorkload").notNull(), status: text("status").notNull().default("Ativa"),
  schoolId: text("schoolId").notNull(), periodId: text("periodId").notNull(), ...timestamps(),
}, t => [uniqueIndex("CurriculumMatrix_schoolId_periodId_name_version_key").on(t.schoolId, t.periodId, t.name, t.version)]);
export const curriculumMatrixSubjects = pgTable("CurriculumMatrixSubject", {
  id: text("id").primaryKey().$defaultFn(createId), workload: integer("workload").notNull(), weeklyLessons: integer("weeklyLessons").notNull().default(1),
  evaluationType: text("evaluationType").notNull().default("Nota"), failsByGrade: boolean("failsByGrade").notNull().default(true),
  appearsOnTranscript: boolean("appearsOnTranscript").notNull().default(true), matrixId: text("matrixId").notNull(), subjectId: text("subjectId").notNull(), ...timestamps(),
}, t => [uniqueIndex("CurriculumMatrixSubject_matrixId_subjectId_key").on(t.matrixId, t.subjectId)]);
export const schoolClasses = pgTable("SchoolClass", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), year: integer("year").notNull(),
  stage: text("stage").notNull(), grade: text("grade").notNull(), shift: text("shift").notNull(), room: text("room"),
  capacity: integer("capacity").notNull().default(30), status: text("status").notNull().default("Aberta"),
  classType: text("classType").notNull().default("Regular"), groupingType: text("groupingType").notNull().default("Disciplina"),
  enrollmentOrder: text("enrollmentOrder").notNull().default("Nome"), annualWorkload: integer("annualWorkload"),
  annualLessons: integer("annualLessons"), lessonMinutes: integer("lessonMinutes"), schoolId: text("schoolId").notNull(),
  teacherId: text("teacherId"), periodId: text("periodId"), matrixId: text("matrixId"), ...timestamps(),
});
export const teacherClassAssignments = pgTable("TeacherClassAssignment", {
  id: text("id").primaryKey().$defaultFn(createId), role: text("role").notNull().default("Docente"), employmentRegime: text("employmentRegime"),
  startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }),
  isActive: boolean("isActive").notNull().default(true), classId: text("classId").notNull(), teacherId: text("teacherId").notNull(),
  subjectId: text("subjectId").notNull(), ...timestamps(),
}, t => [uniqueIndex("TeacherClassAssignment_classId_teacherId_subjectId_startDate_key").on(t.classId, t.teacherId, t.subjectId, t.startDate)]);
export const enrollments = pgTable("Enrollment", {
  id: text("id").primaryKey().$defaultFn(createId), year: integer("year").notNull(), status: text("status").notNull().default("Matriculado"),
  enrollmentDate: timestamp("enrollmentDate", { precision: 3 }).notNull().defaultNow(), endDate: timestamp("endDate", { precision: 3 }),
  supportCode: text("supportCode"), details: jsonb("details").$type<JsonValue>(), studentId: text("studentId").notNull(),
  schoolId: text("schoolId").notNull(), classId: text("classId"), periodId: text("periodId"), ...timestamps(),
});
export const enrollmentMovements = pgTable("EnrollmentMovement", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull(), effectiveDate: timestamp("effectiveDate", { precision: 3 }).notNull(),
  reason: text("reason"), destinationMunicipality: text("destinationMunicipality"), notes: text("notes"), actorName: text("actorName").notNull(),
  enrollmentId: text("enrollmentId").notNull(), sourceClassId: text("sourceClassId"), targetClassId: text("targetClassId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const classScheduleBoards = pgTable("ClassScheduleBoard", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), startDate: timestamp("startDate", { precision: 3 }).notNull(),
  endDate: timestamp("endDate", { precision: 3 }), status: text("status").notNull().default("Rascunho"),
  classId: text("classId").notNull(), periodId: text("periodId").notNull(), ...timestamps(),
});
export const classScheduleEntries = pgTable("ClassScheduleEntry", {
  id: text("id").primaryKey().$defaultFn(createId), weekday: integer("weekday").notNull(), lessonOrder: integer("lessonOrder").notNull(),
  startTime: text("startTime").notNull(), endTime: text("endTime").notNull(), boardId: text("boardId").notNull(),
  subjectId: text("subjectId").notNull(), teacherId: text("teacherId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ClassScheduleEntry_boardId_weekday_lessonOrder_key").on(t.boardId, t.weekday, t.lessonOrder)]);
export const educacensoOperations = pgTable("EducacensoOperation", {
  id: text("id").primaryKey().$defaultFn(createId), operationType: text("operationType").notNull(), competence: text("competence").notNull(),
  layoutVersion: text("layoutVersion").notNull(), fileName: text("fileName").notNull(), checksum: text("checksum").notNull(), status: text("status").notNull(),
  recordsRead: integer("recordsRead").notNull().default(0), validRecords: integer("validRecords").notNull().default(0),
  updatedRecords: integer("updatedRecords").notNull().default(0), inconsistentRecords: integer("inconsistentRecords").notNull().default(0),
  ignoredRecords: integer("ignoredRecords").notNull().default(0), issues: jsonb("issues").$type<JsonValue>(), generatedContent: text("generatedContent"),
  actorName: text("actorName").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const classDiaries = pgTable("ClassDiary", {
  id: text("id").primaryKey().$defaultFn(createId), date: timestamp("date", { precision: 3 }).notNull(),
  contentTaught: text("contentTaught"), observations: text("observations"), status: text("status").notNull().default("Aberto"),
  stage: text("stage").notNull().default("1º Bimestre"), lessonCount: integer("lessonCount").notNull().default(1),
  publishedAt: timestamp("publishedAt", { precision: 3 }), reopenedAt: timestamp("reopenedAt", { precision: 3 }),
  classId: text("classId").notNull(), subjectId: text("subjectId"), teacherId: text("teacherId").notNull(), ...timestamps(),
});
export const schoolCalendarEvents = pgTable("SchoolCalendarEvent", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), date: timestamp("date", { precision: 3 }).notNull(),
  endDate: timestamp("endDate", { precision: 3 }), type: text("type").notNull(), isSchoolDay: boolean("isSchoolDay").notNull().default(false),
  periodId: text("periodId"), ...timestamps(),
});
export const schoolShifts = pgTable("SchoolShift", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), type: text("type").notNull(),
  startTime: text("startTime").notNull(), endTime: text("endTime").notNull(), weekdays: jsonb("weekdays").$type<JsonValue>().notNull(),
  isActive: boolean("isActive").notNull().default(true), schoolId: text("schoolId").notNull(), ...timestamps(),
}, t => [uniqueIndex("SchoolShift_schoolId_name_key").on(t.schoolId, t.name)]);
