import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const date = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => date("createdAt").notNull().defaultNow();
const updatedAt = () => date("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const dteMailboxes = pgTable("DteMailbox", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), establishmentCnpj: text("establishmentCnpj"), accessMode: text("accessMode").notNull().default("LOGIN_PASSWORD"), status: text("status").notNull().default("ATIVA"), emailNoticeEnabled: boolean("emailNoticeEnabled").notNull().default(true), smsNoticeEnabled: boolean("smsNoticeEnabled").notNull().default(false), confirmedAt: date("confirmedAt"), confirmationTokenHash: text("confirmationTokenHash"), confirmationExpiresAt: date("confirmationExpiresAt"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("DteMailbox_taxpayerId_establishmentCnpj_key").on(t.taxpayerId, t.establishmentCnpj), index("DteMailbox_status_idx").on(t.status)]);
export const dteCategories = pgTable("DteCategory", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), retentionRequired: boolean("retentionRequired").notNull().default(true), defaultDeadlineDays: integer("defaultDeadlineDays").notNull().default(5), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("DteCategory_code_key").on(t.code)]);
export const dteMessages = pgTable("DteMessage", {
  id: id(), mailboxId: text("mailboxId").notNull().references(() => dteMailboxes.id, { onDelete: "cascade", onUpdate: "cascade" }), categoryId: text("categoryId").notNull().references(() => dteCategories.id, { onDelete: "restrict", onUpdate: "cascade" }), subject: text("subject").notNull(), body: text("body").notNull(), status: text("status").notNull().default("DISPONIVEL"), processId: text("processId"), documentId: text("documentId"), batchKey: text("batchKey"), idempotencyKey: text("idempotencyKey").notNull(), availableAt: date("availableAt").notNull().defaultNow(), deadlineAt: date("deadlineAt"), readAt: date("readAt"), acknowledgedAt: date("acknowledgedAt"), tacitAcknowledgedAt: date("tacitAcknowledgedAt"), emailNoticeAt: date("emailNoticeAt"), smsNoticeAt: date("smsNoticeAt"), deletedAt: date("deletedAt"), signatureRequired: boolean("signatureRequired").notNull().default(false), signatureStatus: text("signatureStatus"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("DteMessage_idempotencyKey_key").on(t.idempotencyKey), index("DteMessage_mailboxId_status_availableAt_idx").on(t.mailboxId, t.status, t.availableAt), index("DteMessage_batchKey_idx").on(t.batchKey), index("DteMessage_documentId_idx").on(t.documentId)]);
export const dteMessageEvents = pgTable("DteMessageEvent", {
  id: id(), messageId: text("messageId").notNull().references(() => dteMessages.id, { onDelete: "cascade", onUpdate: "cascade" }), eventType: text("eventType").notNull(), description: text("description").notNull(), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
}, t => [index("DteMessageEvent_messageId_createdAt_idx").on(t.messageId, t.createdAt)]);
