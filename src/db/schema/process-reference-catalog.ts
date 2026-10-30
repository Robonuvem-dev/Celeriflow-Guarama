import { boolean, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
export const processReferenceCatalog = pgTable("ProcessReferenceCatalog", {
  id: text("id").primaryKey().$defaultFn(createId),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  subjectId: text("subjectId"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()),
});

export const processRegistrationDetails = pgTable("ProcessRegistrationDetail", {
  processId: text("processId").primaryKey(),
  representativePersonId: text("representativePersonId"),
  otherApplicantId: text("otherApplicantId"),
  declaredValue: numeric("declaredValue", { precision: 18, scale: 2 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});

export const processUnitMetadata = pgTable("ProcessUnitMetadata", {
  unitId: text("unitId").primaryKey(), acronym: text("acronym").notNull(),
});
export const processDepartmentMetadata = pgTable("ProcessDepartmentMetadata", {
  departmentId: text("departmentId").primaryKey(), unitId: text("unitId").notNull(), acronym: text("acronym").notNull(), responsibleEmployeeId: text("responsibleEmployeeId"),
});
export const processPrintSettings = pgTable("ProcessPrintSetting", {
 processTypeId: text("processTypeId").primaryKey(), includeOpening: boolean("includeOpening").notNull().default(true), includeMovements: boolean("includeMovements").notNull().default(true),
});
