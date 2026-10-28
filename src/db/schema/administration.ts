import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const institutions = pgTable("Institution", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  cnpj: text("cnpj"),
  legalName: text("legalName"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zipCode"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  logoUrl: text("logoUrl"),
  mayorName: text("mayorName"),
  managerName: text("managerName"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const secretariats = pgTable("Secretariat", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  acronym: text("acronym"),
  managerName: text("managerName"),
  managerId: text("managerId").references((): AnyPgColumn => employees.id, { onDelete: "set null", onUpdate: "cascade" }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("Secretariat_managerId_idx").on(table.managerId)]);

export const departments = pgTable("Department", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  description: text("description"),
  secretariatId: text("secretariatId").notNull().references(() => secretariats.id, { onDelete: "cascade", onUpdate: "cascade" }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const administrativeUnits = pgTable("AdministrativeUnit", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  type: text("type").notNull(),
  address: text("address"),
  managerName: text("managerName"),
  secretariatId: text("secretariatId").notNull().references(() => secretariats.id, { onDelete: "cascade", onUpdate: "cascade" }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const roles = pgTable("Role", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  description: text("description"),
  level: text("level"),
  canSign: boolean("canSign").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const employees = pgTable("Employee", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  cpf: text("cpf"),
  registration: text("registration"),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("isActive").notNull().default(true),
  salaryBase: doublePrecision("salaryBase").notNull().default(0),
  contractedHours: integer("contractedHours").notNull().default(220),
  roleId: text("roleId").references(() => roles.id, { onDelete: "set null", onUpdate: "cascade" }),
  secretariatId: text("secretariatId").references(() => secretariats.id, { onDelete: "set null", onUpdate: "cascade" }),
  departmentId: text("departmentId").references(() => departments.id, { onDelete: "set null", onUpdate: "cascade" }),
  unitId: text("unitId").references(() => administrativeUnits.id, { onDelete: "set null", onUpdate: "cascade" }),
  personId: text("personId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("Employee_cpf_key").on(table.cpf), uniqueIndex("Employee_personId_key").on(table.personId)]);

export const internalDemands = pgTable("InternalDemand", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Aberta"),
  priority: text("priority").notNull().default("Normal"),
  deadline: timestamp("deadline", { precision: 3 }),
  secretariatId: text("secretariatId").references(() => secretariats.id, { onDelete: "set null", onUpdate: "cascade" }),
  departmentId: text("departmentId").references(() => departments.id, { onDelete: "set null", onUpdate: "cascade" }),
  assigneeId: text("assigneeId").references(() => employees.id, { onDelete: "set null", onUpdate: "cascade" }),
  creatorId: text("creatorId").references(() => employees.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const calendarEvents = pgTable("CalendarEvent", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date", { precision: 3 }).notNull(),
  isHoliday: boolean("isHoliday").notNull().default(false),
  type: text("type").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
