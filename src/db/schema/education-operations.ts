import { doublePrecision, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const timestamps = () => ({ createdAt: createdAt(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const educationLibraryTitles = pgTable("EducationLibraryTitle", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), author: text("author").notNull(), isbn: text("isbn"), category: text("category").notNull(), status: text("status").notNull().default("Disponível"), schoolId: text("schoolId").notNull(), ...timestamps(),
});
export const educationLibraryCopies = pgTable("EducationLibraryCopy", {
  id: text("id").primaryKey().$defaultFn(createId), assetCode: text("assetCode").notNull(), status: text("status").notNull().default("Disponível"), titleId: text("titleId").notNull(), ...timestamps(),
}, t => [uniqueIndex("EducationLibraryCopy_assetCode_key").on(t.assetCode)]);
export const educationLibraryLoans = pgTable("EducationLibraryLoan", {
  id: text("id").primaryKey().$defaultFn(createId), status: text("status").notNull().default("Emprestado"), loanedAt: timestamp("loanedAt", { precision: 3 }).notNull().defaultNow(), dueAt: timestamp("dueAt", { precision: 3 }).notNull(), returnedAt: timestamp("returnedAt", { precision: 3 }),
  renewals: integer("renewals").notNull().default(0), copyId: text("copyId").notNull(), studentId: text("studentId").notNull(), ...timestamps(),
});
export const educationLibraryReservations = pgTable("EducationLibraryReservation", {
  id: text("id").primaryKey().$defaultFn(createId), status: text("status").notNull().default("Aguardando"), position: integer("position").notNull().default(1), titleId: text("titleId").notNull(), studentId: text("studentId").notNull(), ...timestamps(),
}, t => [uniqueIndex("EducationLibraryReservation_titleId_studentId_key").on(t.titleId, t.studentId)]);
export const educationSchoolMenus = pgTable("EducationSchoolMenu", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), weekStart: timestamp("weekStart", { precision: 3 }).notNull(), shift: text("shift").notNull(), status: text("status").notNull().default("Planejado"),
  servingsPlanned: integer("servingsPlanned").notNull().default(0), items: jsonb("items").$type<JsonValue>().notNull(), schoolId: text("schoolId").notNull(), ...timestamps(),
});
export const educationFoodMovements = pgTable("EducationFoodMovement", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull(), quantity: doublePrecision("quantity").notNull(), unitCost: numeric("unitCost", { precision: 18, scale: 2 }), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull().defaultNow(),
  notes: text("notes"), schoolId: text("schoolId").notNull(), materialId: text("materialId").notNull(), warehouseId: text("warehouseId"), createdAt: createdAt(),
});
export const educationFinancialAccounts = pgTable("EducationFinancialAccount", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), status: text("status").notNull().default("Ativa"), schoolId: text("schoolId").notNull(), bankAccountId: text("bankAccountId"), ...timestamps(),
});
export const educationFinancialMovements = pgTable("EducationFinancialMovement", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull(), value: numeric("value", { precision: 18, scale: 2 }).notNull(), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull().defaultNow(),
  description: text("description").notNull(), status: text("status").notNull().default("Confirmado"), accountId: text("accountId").notNull(), createdAt: createdAt(),
});
export const educationApplicationPlans = pgTable("EducationApplicationPlan", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), total: numeric("total", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("Rascunho"), items: jsonb("items").$type<JsonValue>().notNull(),
  submittedAt: timestamp("submittedAt", { precision: 3 }), reviewedAt: timestamp("reviewedAt", { precision: 3 }), schoolId: text("schoolId").notNull(), accountId: text("accountId"), ...timestamps(),
});
export const educationTransportRoutes = pgTable("EducationTransportRoute", {
  id: text("id").primaryKey().$defaultFn(createId), code: text("code").notNull(), name: text("name").notNull(), status: text("status").notNull().default("Ativa"), schoolId: text("schoolId").notNull(), fleetRouteId: text("fleetRouteId"), fleetUnitId: text("fleetUnitId"), ...timestamps(),
}, t => [uniqueIndex("EducationTransportRoute_code_key").on(t.code)]);
export const educationTransportStops = pgTable("EducationTransportStop", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), address: text("address").notNull(), sequence: integer("sequence").notNull(), latitude: doublePrecision("latitude"), longitude: doublePrecision("longitude"), routeId: text("routeId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("EducationTransportStop_routeId_sequence_key").on(t.routeId, t.sequence)]);
export const educationTransportStudents = pgTable("EducationTransportStudent", {
  id: text("id").primaryKey().$defaultFn(createId), status: text("status").notNull().default("Ativo"), boardingStop: text("boardingStop"), routeId: text("routeId").notNull(), studentId: text("studentId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("EducationTransportStudent_routeId_studentId_key").on(t.routeId, t.studentId)]);
export const educationTransportJourneys = pgTable("EducationTransportJourney", {
  id: text("id").primaryKey().$defaultFn(createId), status: text("status").notNull().default("Em andamento"), startedAt: timestamp("startedAt", { precision: 3 }).notNull().defaultNow(), endedAt: timestamp("endedAt", { precision: 3 }), notes: text("notes"), routeId: text("routeId").notNull(), fleetUnitId: text("fleetUnitId"), ...timestamps(),
});
export const educationTransportEvents = pgTable("EducationTransportEvent", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull(), latitude: doublePrecision("latitude"), longitude: doublePrecision("longitude"), notes: text("notes"), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull().defaultNow(), journeyId: text("journeyId").notNull(),
});
