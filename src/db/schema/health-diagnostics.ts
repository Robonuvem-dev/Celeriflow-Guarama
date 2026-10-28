import { boolean, doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { patients } from "./health-registration";
import { healthProfessionals, healthTeams, healthUnits } from "./health-workforce";
import { healthLabExamModels } from "./health-laboratory";
import { healthExamRequests, medicalRecords } from "./health-care";
import { healthServices, healthSpecialties } from "./health-administration";
import { healthEsusForms } from "./health-territory";
import { documents, suppliers } from "./registry";
import { materials, materialMovements, materialStocks, warehouses } from "./assets-stock";

// Complete installed mappings for this writer reservation. Shared mappings are
// imported only as read/FK targets; historical SQL and catalog remain authority.
const id = () => text("id").primaryKey().$defaultFn(createId);
const instant = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => instant("createdAt").notNull().defaultNow();
const updatedAt = () => instant("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const diagnosticLabOrders = pgTable("HealthLabOrder", {
  id: id(), examRequestId: text("examRequestId"), examModelId: text("examModelId"), patientId: text("patientId").notNull(), requestUnitId: text("requestUnitId"), collectionUnitId: text("collectionUnitId"), collectorProfessionalId: text("collectorProfessionalId"), providerSupplierId: text("providerSupplierId"), origin: text("origin").notNull().default("ELECTRONIC_REQUEST"), status: text("status").notNull().default("REQUESTED"), priority: text("priority").notNull().default("ROUTINE"), scheduledAt: instant("scheduledAt"), collectedAt: instant("collectedAt"), expectedResultAt: instant("expectedResultAt"), sampleBarcode: text("sampleBarcode"), collectionByThirdParty: boolean("collectionByThirdParty").notNull().default(false), authorizationKey: text("authorizationKey"), referenceValue: doublePrecision("referenceValue"), idempotencyKey: text("idempotencyKey").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("HealthLabOrder_examRequestId_key").on(t.examRequestId), uniqueIndex("HealthLabOrder_sampleBarcode_key").on(t.sampleBarcode), uniqueIndex("HealthLabOrder_authorizationKey_key").on(t.authorizationKey), uniqueIndex("HealthLabOrder_idempotencyKey_key").on(t.idempotencyKey),
  index("HealthLabOrder_collectionUnitId_scheduledAt_idx").on(t.collectionUnitId, t.scheduledAt), index("HealthLabOrder_patientId_createdAt_idx").on(t.patientId, t.createdAt), index("HealthLabOrder_status_priority_createdAt_idx").on(t.status, t.priority, t.createdAt),
  foreignKey({ name: "HealthLabOrder_examRequestId_fkey", columns: [t.examRequestId], foreignColumns: [healthExamRequests.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabOrder_examModelId_fkey", columns: [t.examModelId], foreignColumns: [healthLabExamModels.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabOrder_patientId_fkey", columns: [t.patientId], foreignColumns: [patients.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabOrder_requestUnitId_fkey", columns: [t.requestUnitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabOrder_collectionUnitId_fkey", columns: [t.collectionUnitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabOrder_collectorProfessionalId_fkey", columns: [t.collectorProfessionalId], foreignColumns: [healthProfessionals.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabOrder_providerSupplierId_fkey", columns: [t.providerSupplierId], foreignColumns: [suppliers.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticLabResults = pgTable("HealthLabResult", {
  id: id(), orderId: text("orderId").notNull(), version: integer("version").notNull(), status: text("status").notNull().default("PARTIAL"), source: text("source").notNull().default("MANUAL"), values: jsonb("values").$type<JsonValue>().notNull(), interpretation: text("interpretation"), deviceCorrelationId: text("deviceCorrelationId"), enteredByUsuarioId: text("enteredByUsuarioId").notNull(), enteredAt: instant("enteredAt").notNull().defaultNow(),
}, t => [uniqueIndex("HealthLabResult_orderId_version_key").on(t.orderId, t.version), index("HealthLabResult_deviceCorrelationId_idx").on(t.deviceCorrelationId), foreignKey({ name: "HealthLabResult_orderId_fkey", columns: [t.orderId], foreignColumns: [diagnosticLabOrders.id] }).onDelete("restrict").onUpdate("cascade")]);
export const diagnosticLabOrderEvents = pgTable("HealthLabOrderEvent", {
  id: id(), orderId: text("orderId").notNull(), eventType: text("eventType").notNull(), fromStatus: text("fromStatus"), toStatus: text("toStatus").notNull(), reason: text("reason"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [index("HealthLabOrderEvent_orderId_createdAt_idx").on(t.orderId, t.createdAt), foreignKey({ name: "HealthLabOrderEvent_orderId_fkey", columns: [t.orderId], foreignColumns: [diagnosticLabOrders.id] }).onDelete("restrict").onUpdate("cascade")]);
export const diagnosticLabReports = pgTable("HealthLabReport", {
  id: id(), orderId: text("orderId").notNull(), documentId: text("documentId").notNull(), status: text("status").notNull().default("DRAFT"), reviewerProfessionalId: text("reviewerProfessionalId"), reviewedAt: instant("reviewedAt"), releasedAt: instant("releasedAt"), publishedAt: instant("publishedAt"), deliveredAt: instant("deliveredAt"), deliveredTo: text("deliveredTo"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("HealthLabReport_documentId_key").on(t.documentId), index("HealthLabReport_orderId_status_idx").on(t.orderId, t.status),
  foreignKey({ name: "HealthLabReport_orderId_fkey", columns: [t.orderId], foreignColumns: [diagnosticLabOrders.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabReport_documentId_fkey", columns: [t.documentId], foreignColumns: [documents.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabReport_reviewerProfessionalId_fkey", columns: [t.reviewerProfessionalId], foreignColumns: [healthProfessionals.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticLabSchedules = pgTable("HealthLabSchedule", {
  id: id(), examModelId: text("examModelId").notNull(), unitId: text("unitId").notNull(), date: instant("date"), weekday: integer("weekday"), capacity: integer("capacity").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index("HealthLabSchedule_unitId_examModelId_isActive_idx").on(t.unitId, t.examModelId, t.isActive),
  foreignKey({ name: "HealthLabSchedule_examModelId_fkey", columns: [t.examModelId], foreignColumns: [healthLabExamModels.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabSchedule_unitId_fkey", columns: [t.unitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticLabProviderQuotas = pgTable("HealthLabProviderQuota", {
  id: id(), providerSupplierId: text("providerSupplierId").notNull(), unitId: text("unitId").notNull(), examModelId: text("examModelId").notNull(), period: text("period").notNull(), allowedQuantity: integer("allowedQuantity").notNull(), consumedQuantity: integer("consumedQuantity").notNull().default(0), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("HealthLabProviderQuota_providerSupplierId_unitId_examModelI_key").on(t.providerSupplierId, t.unitId, t.examModelId, t.period),
  foreignKey({ name: "HealthLabProviderQuota_providerSupplierId_fkey", columns: [t.providerSupplierId], foreignColumns: [suppliers.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabProviderQuota_unitId_fkey", columns: [t.unitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "HealthLabProviderQuota_examModelId_fkey", columns: [t.examModelId], foreignColumns: [healthLabExamModels.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticDevices = pgTable("HealthAssistentialDevice", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), domain: text("domain").notNull(), deviceType: text("deviceType").notNull(), protocol: text("protocol").notNull(), unitId: text("unitId"), operatorUsuarioIds: jsonb("operatorUsuarioIds").$type<JsonValue>().notNull(), configuration: jsonb("configuration").$type<JsonValue>(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthAssistentialDevice_code_key").on(t.code), index("HealthAssistentialDevice_domain_isActive_idx").on(t.domain, t.isActive), foreignKey({ name: "HealthAssistentialDevice_unitId_fkey", columns: [t.unitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade")]);
export const diagnosticDeviceMessages = pgTable("HealthDeviceMessage", {
  id: id(), deviceId: text("deviceId").notNull(), direction: text("direction").notNull(), correlationId: text("correlationId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), status: text("status").notNull(), payloadHash: text("payloadHash").notNull(), sanitizedData: jsonb("sanitizedData").$type<JsonValue>(), processedAt: instant("processedAt"), errorMessage: text("errorMessage"), createdAt: createdAt(),
}, t => [uniqueIndex("HealthDeviceMessage_idempotencyKey_key").on(t.idempotencyKey), index("HealthDeviceMessage_deviceId_createdAt_idx").on(t.deviceId, t.createdAt), index("HealthDeviceMessage_correlationId_idx").on(t.correlationId), foreignKey({ name: "HealthDeviceMessage_deviceId_fkey", columns: [t.deviceId], foreignColumns: [diagnosticDevices.id] }).onDelete("restrict").onUpdate("cascade")]);

export const diagnosticSpecializedCatalog = pgTable("SpecializedCatalogItem", {
  id: id(), category: text("category").notNull(), code: text("code").notNull(), name: text("name").notNull(), referenceValue: doublePrecision("referenceValue"), materialId: text("materialId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SpecializedCatalogItem_category_code_key").on(t.category, t.code), index("SpecializedCatalogItem_category_isActive_name_idx").on(t.category, t.isActive, t.name), foreignKey({ name: "SpecializedCatalogItem_materialId_fkey", columns: [t.materialId], foreignColumns: [materials.id] }).onDelete("restrict").onUpdate("cascade")]);
export const diagnosticSpecializedSchedules = pgTable("SpecializedTeamSchedule", {
  id: id(), teamId: text("teamId").notNull(), unitId: text("unitId").notNull(), month: text("month").notNull(), patientCapacity: integer("patientCapacity").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("SpecializedTeamSchedule_teamId_unitId_month_key").on(t.teamId, t.unitId, t.month),
  foreignKey({ name: "SpecializedTeamSchedule_teamId_fkey", columns: [t.teamId], foreignColumns: [healthTeams.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedTeamSchedule_unitId_fkey", columns: [t.unitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticSpecializedPlans = pgTable("SpecializedTherapeuticPlan", {
  id: id(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), teamId: text("teamId").notNull(), initialMedicalRecordId: text("initialMedicalRecordId"), status: text("status").notNull().default("ACTIVE"), goals: text("goals").notNull(), carePlan: text("carePlan").notNull(), plannedConsultations: integer("plannedConsultations").notNull(), completedConsultations: integer("completedConsultations").notNull().default(0), outcome: text("outcome"), startedAt: instant("startedAt").notNull().defaultNow(), completedAt: instant("completedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index("SpecializedTherapeuticPlan_patientId_status_startedAt_idx").on(t.patientId, t.status, t.startedAt), index("SpecializedTherapeuticPlan_teamId_status_idx").on(t.teamId, t.status),
  foreignKey({ name: "SpecializedTherapeuticPlan_patientId_fkey", columns: [t.patientId], foreignColumns: [patients.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedTherapeuticPlan_unitId_fkey", columns: [t.unitId], foreignColumns: [healthUnits.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedTherapeuticPlan_teamId_fkey", columns: [t.teamId], foreignColumns: [healthTeams.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedTherapeuticPlan_initialMedicalRecordId_fkey", columns: [t.initialMedicalRecordId], foreignColumns: [medicalRecords.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticSpecializedEntries = pgTable("SpecializedPlanEntry", {
  id: id(), planId: text("planId").notNull(), professionalId: text("professionalId").notNull(), specialtyId: text("specialtyId"), medicalRecordId: text("medicalRecordId"), kind: text("kind").notNull(), content: text("content").notNull(), diagnosisSummary: text("diagnosisSummary"), weight: doublePrecision("weight"), height: doublePrecision("height"), bmi: doublePrecision("bmi"), createdAt: createdAt(), healthServiceId: text("healthServiceId"),
}, t => [
  index("SpecializedPlanEntry_planId_createdAt_idx").on(t.planId, t.createdAt), index("SpecializedPlanEntry_professionalId_createdAt_idx").on(t.professionalId, t.createdAt),
  foreignKey({ name: "SpecializedPlanEntry_planId_fkey", columns: [t.planId], foreignColumns: [diagnosticSpecializedPlans.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedPlanEntry_professionalId_fkey", columns: [t.professionalId], foreignColumns: [healthProfessionals.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedPlanEntry_specialtyId_fkey", columns: [t.specialtyId], foreignColumns: [healthSpecialties.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedPlanEntry_medicalRecordId_fkey", columns: [t.medicalRecordId], foreignColumns: [medicalRecords.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedPlanEntry_healthServiceId_fkey", columns: [t.healthServiceId], foreignColumns: [healthServices.id] }).onDelete("set null").onUpdate("cascade"),
]);
export const diagnosticSpecializedQuotas = pgTable("SpecializedQuota", {
  id: id(), patientId: text("patientId").notNull(), materialId: text("materialId").notNull(), period: text("period").notNull(), allowedQuantity: doublePrecision("allowedQuantity").notNull(), consumedQuantity: doublePrecision("consumedQuantity").notNull().default(0), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("SpecializedQuota_patientId_materialId_period_key").on(t.patientId, t.materialId, t.period),
  foreignKey({ name: "SpecializedQuota_patientId_fkey", columns: [t.patientId], foreignColumns: [patients.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedQuota_materialId_fkey", columns: [t.materialId], foreignColumns: [materials.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticSpecializedDistributions = pgTable("SpecializedDistribution", {
  id: id(), planId: text("planId").notNull(), quotaId: text("quotaId"), patientId: text("patientId").notNull(), warehouseId: text("warehouseId").notNull(), materialId: text("materialId").notNull(), stockId: text("stockId").notNull(), movementId: text("movementId").notNull(), quantity: doublePrecision("quantity").notNull(), referenceValue: doublePrecision("referenceValue"), deliveredByUsuarioId: text("deliveredByUsuarioId").notNull(), deliveredAt: instant("deliveredAt").notNull().defaultNow(), notes: text("notes"),
}, t => [
  uniqueIndex("SpecializedDistribution_movementId_key").on(t.movementId), index("SpecializedDistribution_patientId_deliveredAt_idx").on(t.patientId, t.deliveredAt), index("SpecializedDistribution_planId_deliveredAt_idx").on(t.planId, t.deliveredAt),
  foreignKey({ name: "SpecializedDistribution_planId_fkey", columns: [t.planId], foreignColumns: [diagnosticSpecializedPlans.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedDistribution_quotaId_fkey", columns: [t.quotaId], foreignColumns: [diagnosticSpecializedQuotas.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedDistribution_patientId_fkey", columns: [t.patientId], foreignColumns: [patients.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedDistribution_warehouseId_fkey", columns: [t.warehouseId], foreignColumns: [warehouses.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedDistribution_materialId_fkey", columns: [t.materialId], foreignColumns: [materials.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedDistribution_stockId_fkey", columns: [t.stockId], foreignColumns: [materialStocks.id] }).onDelete("restrict").onUpdate("cascade"),
  foreignKey({ name: "SpecializedDistribution_movementId_fkey", columns: [t.movementId], foreignColumns: [materialMovements.id] }).onDelete("restrict").onUpdate("cascade"),
]);
export const diagnosticEsusBatches = pgTable("HealthEsusBatch", {
  id: id(), competence: text("competence").notNull(), status: text("status").notNull().default("GERADO"), fileContent: text("fileContent").notNull(), hash: text("hash").notNull(), total: integer("total").notNull(), accepted: integer("accepted").notNull().default(0), rejected: integer("rejected").notNull().default(0), errors: jsonb("errors").$type<JsonValue>(), processedAt: instant("processedAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [index("HealthEsusBatch_competence_status_idx").on(t.competence, t.status)]);
export const diagnosticEsusBatchItems = pgTable("HealthEsusBatchItem", {
  id: id(), batchId: text("batchId").notNull(), formId: text("formId").notNull(), status: text("status").notNull().default("PENDENTE"), message: text("message"), createdAt: createdAt(),
}, t => [uniqueIndex("HealthEsusBatchItem_batchId_formId_key").on(t.batchId, t.formId), foreignKey({ name: "HealthEsusBatchItem_batchId_fkey", columns: [t.batchId], foreignColumns: [diagnosticEsusBatches.id] }).onDelete("cascade").onUpdate("cascade"), foreignKey({ name: "HealthEsusBatchItem_formId_fkey", columns: [t.formId], foreignColumns: [healthEsusForms.id] }).onDelete("restrict").onUpdate("cascade")]);
