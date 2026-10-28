import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const time = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => time("createdAt").notNull().defaultNow();

// Existing physical tables from the historical SQL; explicit domain imports only.
export const healthFollowupReceivers = pgTable("HealthFollowupReceiver", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), contractName: text("contractName").notNull(), schemaVersion: text("schemaVersion").notNull(), unitId: text("unitId").notNull(), nextSequence: integer("nextSequence").notNull().default(1), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFollowupReceiver_code_key").on(t.code)]);
export const healthFollowupBindings = pgTable("HealthFollowupBinding", {
  id: id(), connectionId: text("connectionId").notNull(), receiverId: text("receiverId").notNull(), unitId: text("unitId").notNull(), contractName: text("contractName").notNull(), schemaVersion: text("schemaVersion").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFollowupBinding_connectionId_key").on(t.connectionId), uniqueIndex("HealthFollowupBinding_receiverId_key").on(t.receiverId), uniqueIndex("HealthFollowupBinding_unitId_contractName_key").on(t.unitId, t.contractName)]);
export const healthFollowupBatches = pgTable("HealthFollowupBatch", {
  id: id(), bindingId: text("bindingId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), fromDate: date("fromDate", { mode: "date" }).notNull(), toDate: date("toDate", { mode: "date" }).notNull(), contractName: text("contractName").notNull(), schemaVersion: text("schemaVersion").notNull(), reprocessOfId: text("reprocessOfId"), onlyRejected: boolean("onlyRejected").notNull().default(false), hashSha256: text("hashSha256").notNull(), payload: jsonb("payload").$type<JsonValue>().notNull(), status: text("status").notNull().default("GERADA"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFollowupBatch_bindingId_idempotencyKey_key").on(t.bindingId, t.idempotencyKey)]);
export const healthFollowupBatchItems = pgTable("HealthFollowupBatchItem", {
  id: id(), batchId: text("batchId").notNull(), ordinal: integer("ordinal").notNull(), originType: text("originType").notNull(), originId: text("originId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), sourceVersion: text("sourceVersion").notNull(), payload: jsonb("payload").$type<JsonValue>().notNull(),
}, t => [uniqueIndex("HealthFollowupBatchItem_batchId_ordinal_key").on(t.batchId, t.ordinal), uniqueIndex("HealthFollowupBatchItem_batchId_originType_originId_key").on(t.batchId, t.originType, t.originId)]);
export const healthFollowupReceipts = pgTable("HealthFollowupReceipt", {
  id: id(), receiverId: text("receiverId").notNull(), batchId: text("batchId").notNull(), integrationRunId: text("integrationRunId").notNull(), protocol: text("protocol").notNull(), receiverSnapshot: jsonb("receiverSnapshot").$type<JsonValue>().notNull(), status: text("status").notNull(), total: integer("total").notNull(), accepted: integer("accepted").notNull(), rejected: integer("rejected").notNull(), unchanged: integer("unchanged").notNull(), processedByUsuarioId: text("processedByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFollowupReceipt_batchId_key").on(t.batchId), uniqueIndex("HealthFollowupReceipt_integrationRunId_key").on(t.integrationRunId), uniqueIndex("HealthFollowupReceipt_protocol_key").on(t.protocol)]);
export const healthFollowupRecords = pgTable("HealthFollowupRecord", {
  id: id(), receiverId: text("receiverId").notNull(), originType: text("originType").notNull(), originId: text("originId").notNull(), unitId: text("unitId").notNull(), patientId: text("patientId").notNull(), professionalId: text("professionalId"), sourceVersion: text("sourceVersion").notNull(), sourceUpdatedAt: time("sourceUpdatedAt").notNull(), snapshotAt: time("snapshotAt").notNull(), payload: jsonb("payload").$type<JsonValue>().notNull(), lastBatchId: text("lastBatchId").notNull(), lastReceivedAt: time("lastReceivedAt").notNull().defaultNow(),
}, t => [uniqueIndex("HealthFollowupRecord_receiverId_originType_originId_key").on(t.receiverId, t.originType, t.originId)]);
export const healthFollowupProcessedKeys = pgTable("HealthFollowupProcessedKey", {
  id: id(), receiverId: text("receiverId").notNull(), key: text("key").notNull(), recordId: text("recordId").notNull(), sourceVersion: text("sourceVersion").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFollowupProcessedKey_receiverId_key_key").on(t.receiverId, t.key)]);
export const healthFollowupResults = pgTable("HealthFollowupResult", {
  id: id(), receiptId: text("receiptId").notNull(), batchItemId: text("batchItemId").notNull(), recordId: text("recordId"), status: text("status").notNull(), message: text("message").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthFollowupResult_batchItemId_key").on(t.batchItemId)]);
