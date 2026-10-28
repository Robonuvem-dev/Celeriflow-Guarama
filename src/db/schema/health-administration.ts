import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthSpecialties = pgTable("HealthSpecialty", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthSpecialty_code_key").on(t.code), uniqueIndex("HealthSpecialty_name_key").on(t.name)]);
export const healthServices = pgTable("HealthService", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), classification: text("classification"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthService_code_key").on(t.code)]);
export const healthSpecialtyGroups = pgTable("HealthSpecialtyGroup", {
  id: id(), name: text("name").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthSpecialtyGroup_name_key").on(t.name)]);
export const healthSpecialtyGroupMembers = pgTable("HealthSpecialtyGroupMember", {
  id: id(), groupId: text("groupId").notNull(), specialtyId: text("specialtyId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthSpecialtyGroupMember_groupId_specialtyId_key").on(t.groupId, t.specialtyId)]);
export const healthSpecialtyGroupServices = pgTable("HealthSpecialtyGroupService", {
  id: id(), groupId: text("groupId").notNull(), serviceId: text("serviceId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthSpecialtyGroupService_groupId_serviceId_key").on(t.groupId, t.serviceId)]);
export const healthUnitShifts = pgTable("HealthUnitShift", {
  id: id(), unitId: text("unitId").notNull(), dayOfWeek: integer("dayOfWeek").notNull(), startTime: text("startTime").notNull(), endTime: text("endTime").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthUnitShift_unitId_dayOfWeek_startTime_endTime_key").on(t.unitId, t.dayOfWeek, t.startTime, t.endTime)]);
export const healthUnitSpecialties = pgTable("HealthUnitSpecialty", {
  id: id(), unitId: text("unitId").notNull(), specialtyId: text("specialtyId").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthUnitSpecialty_unitId_specialtyId_key").on(t.unitId, t.specialtyId)]);
export const healthServiceAssignments = pgTable("HealthServiceAssignment", {
  id: id(), serviceId: text("serviceId").notNull(), unitId: text("unitId"), professionalId: text("professionalId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthServiceAssignment_serviceId_unitId_key").on(t.serviceId, t.unitId), uniqueIndex("HealthServiceAssignment_serviceId_professionalId_key").on(t.serviceId, t.professionalId)]);
export const healthHabilitations = pgTable("HealthHabilitation", {
  id: id(), code: text("code").notNull(), description: text("description").notNull(), unitId: text("unitId"), professionalId: text("professionalId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthHabilitation_code_unitId_key").on(t.code, t.unitId), uniqueIndex("HealthHabilitation_code_professionalId_key").on(t.code, t.professionalId)]);
export const healthSchedulingGroups = pgTable("HealthSchedulingGroup", {
  id: id(), name: text("name").notNull(), unitId: text("unitId").notNull(), specialtyGroupId: text("specialtyGroupId").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthSchedulingGroup_name_unitId_key").on(t.name, t.unitId)]);
export const healthRegistrationStatusHistory = pgTable("HealthRegistrationStatusHistory", {
  id: id(), unitId: text("unitId"), professionalId: text("professionalId"), isActive: boolean("isActive").notNull(), reason: text("reason"), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull().defaultNow(),
});
