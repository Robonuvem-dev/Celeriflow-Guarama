import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@/db/ids";
import type { JsonValue } from "@/db/json";

const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
export const sstCertificateReasons = pgTable("SstCertificateReason", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), code: text("code").notNull(), name: text("name").notNull(), dependentPolicy: text("dependentPolicy").notNull().default("DISABLED"), restrictedRoleIds: text("restrictedRoleIds").array().default([]),
  autoProtocol: boolean("autoProtocol").notNull().default(true), autoPresentedAt: boolean("autoPresentedAt").notNull().default(true), printReceipt: boolean("printReceipt").notNull().default(false), suggestLeave: boolean("suggestLeave").notNull().default(false), createLeaveOnApproval: boolean("createLeaveOnApproval").notNull().default(false), leaveType: text("leaveType").notNull().default("Licença médica"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SstCertificateReason_budgetUnitId_code_key").on(t.budgetUnitId, t.code)]);
export const sstCertificates = pgTable("SstMedicalCertificate", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), employeeId: text("employeeId").notNull(), reasonId: text("reasonId").notNull(), issuerPersonId: text("issuerPersonId").notNull(), issuerCouncil: text("issuerCouncil").notNull(), dependentId: text("dependentId"), relationship: text("relationship"),
  startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), presentedAt: timestamp("presentedAt", { precision: 3 }).notNull(), protocolNumber: text("protocolNumber").notNull(), processId: text("processId"), status: text("status").notNull().default("RECEIVED"), cidCodes: text("cidCodes").array().default([]), leaveId: text("leaveId"), roleIdSnapshot: text("roleIdSnapshot"), departmentIdSnapshot: text("departmentIdSnapshot"), reasonSnapshot: jsonb("reasonSnapshot").$type<JsonValue>(), createdById: text("createdById").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SstMedicalCertificate_budgetUnitId_protocolNumber_key").on(t.budgetUnitId, t.protocolNumber), uniqueIndex("SstMedicalCertificate_leaveId_key").on(t.leaveId)]);
export const sstAssessments = pgTable("SstMedicalAssessment", {
  id: text("id").primaryKey().$defaultFn(createId), certificateId: text("certificateId").notNull(), boardId: text("boardId"), examinerPersonId: text("examinerPersonId").notNull(), examinerCouncil: text("examinerCouncil").notNull(), decision: text("decision").notNull(), opinion: text("opinion").notNull(), assessedAt: timestamp("assessedAt", { precision: 3 }).notNull(), createdById: text("createdById").notNull(), createdAt: createdAt(),
});
export const sstCertificateDocuments = pgTable("SstCertificateDocument", {
  id: text("id").primaryKey().$defaultFn(createId), certificateId: text("certificateId").notNull(), documentId: text("documentId").notNull().unique(), createdById: text("createdById").notNull(), createdAt: createdAt(),
});
