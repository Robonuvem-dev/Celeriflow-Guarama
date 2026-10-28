import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const healthCarePrograms = pgTable("HealthCareProgram", {
  id: text("id").primaryKey().$defaultFn(createId), code: text("code").notNull(), name: text("name").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("HealthCareProgram_code_key").on(table.code)]);

export const healthCareProgramEnrollments = pgTable("HealthCareProgramEnrollment", {
  id: text("id").primaryKey().$defaultFn(createId), programId: text("programId").notNull(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }), reason: text("reason").notNull(), closureReason: text("closureReason"), createdByUsuarioId: text("createdByUsuarioId").notNull(), closedByUsuarioId: text("closedByUsuarioId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("HealthCareProgramEnrollment_programId_patientId_startsAt_idx").on(table.programId, table.patientId, table.startsAt)]);
