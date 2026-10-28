import { boolean, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
const timestamps = () => ({ id: text("id").primaryKey().$defaultFn(createId), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const supplierPortalIdentities = pgTable("SupplierPortalIdentity", {
  ...timestamps(), supplierId: text("supplierId").notNull(), usuarioId: text("usuarioId").notNull(), status: text("status").notNull().default("Ativo"),
}, table => [uniqueIndex("SupplierPortalIdentity_supplierId_usuarioId_key").on(table.supplierId, table.usuarioId)]);
export const biddingAppointments = pgTable("BiddingAppointment", {
  ...timestamps(), kind: text("kind").notNull(), name: text("name").notNull(), appointmentDocumentId: text("appointmentDocumentId"), appointedAt: timestamp("appointedAt", { precision: 3 }), endsAt: timestamp("endsAt", { precision: 3 }), status: text("status").notNull().default("Ativa"), notes: text("notes"),
});
export const biddingAppointmentMembers = pgTable("BiddingAppointmentMember", {
  ...timestamps(), appointmentId: text("appointmentId").notNull(), employeeId: text("employeeId").notNull(), role: text("role").notNull(), appointedAt: timestamp("appointedAt", { precision: 3 }), endsAt: timestamp("endsAt", { precision: 3 }), status: text("status").notNull().default("Ativo"),
}, table => [uniqueIndex("BiddingAppointmentMember_appointmentId_employeeId_role_key").on(table.appointmentId, table.employeeId, table.role)]);
export const biddingAppointmentAssignments = pgTable("BiddingAppointmentAssignment", {
  ...timestamps(), biddingId: text("biddingId").notNull(), appointmentId: text("appointmentId").notNull(), role: text("role"), assignedAt: timestamp("assignedAt", { precision: 3 }).notNull().defaultNow(), endedAt: timestamp("endedAt", { precision: 3 }), status: text("status").notNull().default("Ativa"), preliminaryTechnicalStudyId: text("preliminaryTechnicalStudyId"),
}, table => [uniqueIndex("BiddingAppointmentAssignment_biddingId_appointmentId_key").on(table.biddingId, table.appointmentId)]);
export const biddingPhases = pgTable("BiddingPhase", {
  ...timestamps(), biddingId: text("biddingId").notNull(), code: text("code").notNull(), name: text("name").notNull(), sequence: integer("sequence").notNull(), version: integer("version").notNull().default(1), isCurrent: boolean("isCurrent").notNull().default(true), status: text("status").notNull().default("Pendente"), startedAt: timestamp("startedAt", { precision: 3 }), completedAt: timestamp("completedAt", { precision: 3 }), preliminaryTechnicalStudyId: text("preliminaryTechnicalStudyId"),
}, table => [uniqueIndex("BiddingPhase_biddingId_code_version_key").on(table.biddingId, table.code, table.version), uniqueIndex("BiddingPhase_biddingId_sequence_version_key").on(table.biddingId, table.sequence, table.version)]);
export const biddingActs = pgTable("BiddingAct", {
  ...timestamps(), biddingId: text("biddingId").notNull(), phaseId: text("phaseId"), biddingLotId: text("biddingLotId"), type: text("type").notNull(), description: text("description"), status: text("status").notNull().default("Registrado"), occurredAt: timestamp("occurredAt", { precision: 3 }).notNull().defaultNow(), documentId: text("documentId"), actorUsuarioId: text("actorUsuarioId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), preliminaryTechnicalStudyId: text("preliminaryTechnicalStudyId"),
}, table => [uniqueIndex("BiddingAct_idempotencyKey_key").on(table.idempotencyKey)]);
export const biddingLotItems = pgTable("BiddingLotItem", {
  ...timestamps(), biddingLotId: text("biddingLotId").notNull(), purchaseProcessItemId: text("purchaseProcessItemId").notNull(), quantity: doublePrecision("quantity").notNull(),
}, table => [uniqueIndex("BiddingLotItem_biddingLotId_purchaseProcessItemId_key").on(table.biddingLotId, table.purchaseProcessItemId)]);
export const biddingBids = pgTable("BiddingBid", {
  ...timestamps(), biddingLotId: text("biddingLotId").notNull(), participantId: text("participantId").notNull(), supplierPortalIdentityId: text("supplierPortalIdentityId").notNull(), kind: text("kind").notNull().default("Lance"), unitValueDecimal: exactNumeric("unitValueDecimal", { precision: 18, scale: 2 }), totalValueDecimal: exactNumeric("totalValueDecimal", { precision: 18, scale: 2 }).notNull(), sequence: integer("sequence").notNull(), submittedAt: timestamp("submittedAt", { precision: 3 }).notNull().defaultNow(), status: text("status").notNull().default("Aceito"), idempotencyKey: text("idempotencyKey").notNull(),
}, table => [uniqueIndex("BiddingBid_idempotencyKey_key").on(table.idempotencyKey), uniqueIndex("BiddingBid_biddingLotId_sequence_key").on(table.biddingLotId, table.sequence)]);
export const biddingEligibilities = pgTable("BiddingEligibility", {
  ...timestamps(), biddingLotId: text("biddingLotId").notNull(), participantId: text("participantId").notNull(), status: text("status").notNull(), reason: text("reason"), documentId: text("documentId"), decidedByUsuarioId: text("decidedByUsuarioId").notNull(), decidedAt: timestamp("decidedAt", { precision: 3 }).notNull().defaultNow(), idempotencyKey: text("idempotencyKey").notNull(),
}, table => [uniqueIndex("BiddingEligibility_idempotencyKey_key").on(table.idempotencyKey)]);
