import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthLabExamModels = pgTable("HealthLabExamModel", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), procedureId: text("procedureId"), questionnaireId: text("questionnaireId"), bench: text("bench"), preparation: text("preparation"), performedInternally: boolean("performedInternally").notNull().default(true), deliveryDays: integer("deliveryDays").notNull().default(0), duplicateWindowDays: integer("duplicateWindowDays").notNull().default(0), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthLabExamModel_code_key").on(t.code)]);
export const healthLabOrders = pgTable("HealthLabOrder", {
  id: id(), examRequestId: text("examRequestId"), examModelId: text("examModelId"), patientId: text("patientId").notNull(), requestUnitId: text("requestUnitId"), collectionUnitId: text("collectionUnitId"), collectorProfessionalId: text("collectorProfessionalId"), providerSupplierId: text("providerSupplierId"), origin: text("origin").notNull().default("ELECTRONIC_REQUEST"), status: text("status").notNull().default("REQUESTED"), priority: text("priority").notNull().default("ROUTINE"), scheduledAt: timestamp("scheduledAt", { precision: 3 }), collectedAt: timestamp("collectedAt", { precision: 3 }), expectedResultAt: timestamp("expectedResultAt", { precision: 3 }), sampleBarcode: text("sampleBarcode"), collectionByThirdParty: boolean("collectionByThirdParty").notNull().default(false), authorizationKey: text("authorizationKey"), referenceValue: doublePrecision("referenceValue"), idempotencyKey: text("idempotencyKey").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthLabOrder_examRequestId_key").on(t.examRequestId), uniqueIndex("HealthLabOrder_sampleBarcode_key").on(t.sampleBarcode), uniqueIndex("HealthLabOrder_authorizationKey_key").on(t.authorizationKey), uniqueIndex("HealthLabOrder_idempotencyKey_key").on(t.idempotencyKey)]);
export const healthLabResults = pgTable("HealthLabResult", {
  id: id(), orderId: text("orderId").notNull(), version: integer("version").notNull(), status: text("status").notNull().default("PARTIAL"), source: text("source").notNull().default("MANUAL"), values: jsonb("values").notNull(), interpretation: text("interpretation"), deviceCorrelationId: text("deviceCorrelationId"), enteredByUsuarioId: text("enteredByUsuarioId").notNull(), enteredAt: timestamp("enteredAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("HealthLabResult_orderId_version_key").on(t.orderId, t.version)]);
