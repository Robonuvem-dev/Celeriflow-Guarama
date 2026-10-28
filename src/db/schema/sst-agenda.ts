import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@/db/ids";

export const sstBoards = pgTable("SstMedicalBoard", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), name: text("name").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(),
  isActive: boolean("isActive").notNull().default(true), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const sstBoardMembers = pgTable("SstMedicalBoardMember", {
  id: text("id").primaryKey().$defaultFn(createId), boardId: text("boardId").notNull(), personId: text("personId").notNull(), council: text("council").notNull(),
}, t => [uniqueIndex("SstMedicalBoardMember_boardId_personId_key").on(t.boardId, t.personId)]);
export const sstAvailability = pgTable("SstScheduleAvailability", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), professionalPersonId: text("professionalPersonId").notNull(), unitName: text("unitName").notNull(),
  startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), slotMinutes: integer("slotMinutes").notNull(), isActive: boolean("isActive").notNull().default(true),
  createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const sstScheduleBlocks = pgTable("SstScheduleBlock", {
  id: text("id").primaryKey().$defaultFn(createId), availabilityId: text("availabilityId").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), reason: text("reason").notNull(), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const sstAppointments = pgTable("SstAppointment", {
  id: text("id").primaryKey().$defaultFn(createId), availabilityId: text("availabilityId").notNull(), employeeId: text("employeeId").notNull(), purpose: text("purpose").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(),
  status: text("status").notNull().default("BOOKED"), cancellationReason: text("cancellationReason"), cancelledAt: timestamp("cancelledAt", { precision: 3 }), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const sstPlannedShifts = pgTable("SstPlannedShift", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), employeeId: text("employeeId").notNull(), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), source: text("source").notNull().default("RH_MANUAL"), roleIdSnapshot: text("roleIdSnapshot"), departmentIdSnapshot: text("departmentIdSnapshot"), createdById: text("createdById").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("SstPlannedShift_budgetUnitId_employeeId_startsAt_endsAt_key").on(t.budgetUnitId, t.employeeId, t.startsAt, t.endsAt)]);
