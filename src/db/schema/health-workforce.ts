import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthUnits = pgTable("HealthUnit", {
  id: id(), name: text("name").notNull(), type: text("type").notNull(), cnes: text("cnes"), phone: text("phone"), email: text("email"), isActive: boolean("isActive").notNull().default(true), isThirdParty: boolean("isThirdParty").notNull().default(false), inactivatedAt: timestamp("inactivatedAt", { precision: 3 }), inactivationReason: text("inactivationReason"), addressId: text("addressId"), managerId: text("managerId"), maintainerId: text("maintainerId"), pharmacyReportingUnitId: text("pharmacyReportingUnitId"), spontaneousProviderUnitId: text("spontaneousProviderUnitId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthUnit_cnes_key").on(t.cnes), uniqueIndex("HealthUnit_addressId_key").on(t.addressId)]);

export const healthTeams = pgTable("HealthTeam", {
  id: id(), name: text("name").notNull(), code: text("code"), microarea: text("microarea"), classification: text("classification"), unitId: text("unitId").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthTeam_code_key").on(t.code)]);

export const healthProfessionals = pgTable("HealthProfessional", {
  id: id(), employeeId: text("employeeId").notNull(), unitId: text("unitId"), teamId: text("teamId"), cbo: text("cbo"), cboId: text("cboId"), cns: text("cns"), councilName: text("councilName"), councilNumber: text("councilNumber"), specialty: text("specialty"), treatment: text("treatment"), isAuditor: boolean("isAuditor").notNull().default(false), consultationIntervalMinutes: integer("consultationIntervalMinutes"), isActive: boolean("isActive").notNull().default(true), inactivatedAt: timestamp("inactivatedAt", { precision: 3 }), inactivationReason: text("inactivationReason"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthProfessional_employeeId_key").on(t.employeeId)]);

export const healthProfessionalAssignments = pgTable("HealthProfessionalAssignment", {
  id: id(), professionalId: text("professionalId").notNull(), unitId: text("unitId").notNull(), specialtyId: text("specialtyId"), weeklyHours: integer("weeklyHours").notNull().default(0), validFrom: timestamp("validFrom", { precision: 3 }), validUntil: timestamp("validUntil", { precision: 3 }), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthProfessionalAssignment_professionalId_unitId_specialtyId_key").on(t.professionalId, t.unitId, t.specialtyId)]);

export const healthProfessionalShifts = pgTable("HealthProfessionalShift", {
  id: id(), assignmentId: text("assignmentId").notNull(), weekday: integer("weekday").notNull(), startTime: text("startTime").notNull(), endTime: text("endTime").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthProfessionalShift_assignmentId_weekday_startTime_key").on(t.assignmentId, t.weekday, t.startTime)]);

export const healthTeamClassificationEvents = pgTable("HealthTeamClassificationEvent", {
  id: id(), teamId: text("teamId").notNull(), before: text("before"), after: text("after").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});

export const healthMaintainers = pgTable("HealthMaintainer", {
  id: id(), companyId: text("companyId").notNull(), bankName: text("bankName"), agency: text("agency"), account: text("account"), supportServices: text("supportServices").array().notNull(), characterization: text("characterization").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthMaintainer_companyId_key").on(t.companyId)]);
