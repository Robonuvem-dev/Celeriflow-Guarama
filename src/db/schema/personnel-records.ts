import { boolean, doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const personnelActs = pgTable("PersonnelAct", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), type: text("type").notNull(), actNumber: text("actNumber"), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), documentUrl: text("documentUrl"), ...timestamps(),
});
export const attendanceRecords = pgTable("AttendanceRecord", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), date: timestamp("date", { precision: 3 }).notNull(), entryTime: timestamp("entryTime", { precision: 3 }), exitTime: timestamp("exitTime", { precision: 3 }), status: text("status").notNull().default("Presente"), hoursWorked: doublePrecision("hoursWorked").notNull().default(0), extraHours: doublePrecision("extraHours").notNull().default(0), bankHours: doublePrecision("bankHours").notNull().default(0), contractedHours: doublePrecision("contractedHours").notNull().default(8), ...timestamps(),
});
export const dependents = pgTable("Dependent", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), personId: text("personId"), name: text("name").notNull(), cpf: text("cpf"), birthDate: timestamp("birthDate", { precision: 3 }), relationship: text("relationship").notNull(), irrfDependent: boolean("irrfDependent").notNull().default(false), familyWage: boolean("familyWage").notNull().default(false), ...timestamps(),
});
export const leaves = pgTable("Leave", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), type: text("type").notNull(), startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }).notNull(), reason: text("reason"), status: text("status").notNull().default("Ativa"), ...timestamps(),
});
export const vacations = pgTable("Vacation", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(), acquisitionStart: timestamp("acquisitionStart", { precision: 3 }).notNull(), acquisitionEnd: timestamp("acquisitionEnd", { precision: 3 }).notNull(), enjoymentStart: timestamp("enjoymentStart", { precision: 3 }), enjoymentEnd: timestamp("enjoymentEnd", { precision: 3 }), days: integer("days").notNull().default(30), status: text("status").notNull().default("A vencer"), ...timestamps(),
});
