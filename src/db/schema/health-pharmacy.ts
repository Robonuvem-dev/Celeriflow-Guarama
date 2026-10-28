import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const time = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => time("createdAt").notNull().defaultNow();
const updatedAt = () => time("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

// Existing physical tables only; this module is not a migration/DDL registration.
// Pharmacy quantities and conversion factors are physically float8, not numeric.
export const healthMaterialProfiles = pgTable("HealthMaterialProfile", {
  id: id(), materialId: text("materialId").notNull(), productKind: text("productKind").notNull(), subgroup: text("subgroup"), packaging: text("packaging"), dcbCode: text("dcbCode"), classification: text("classification"), barcode: text("barcode"), sourceCatalog: text("sourceCatalog"), sourceCode: text("sourceCode"), patientReleaseAllowed: boolean("patientReleaseAllowed").notNull().default(true), manufacturerSupplierId: text("manufacturerSupplierId"), isActive: boolean("isActive").notNull().default(true), catmatCode: text("catmatCode"), supplyUnitCode: text("supplyUnitCode"), stockUnitsPerSupply: doublePrecision("stockUnitsPerSupply").notNull().default(1), renameMember: boolean("renameMember").notNull().default(false), renameReference: text("renameReference"), remumeMember: boolean("remumeMember").notNull().default(false), remumeReference: text("remumeReference"), prescriptionRecommendation: text("prescriptionRecommendation"), pharmaceuticalComponent: text("pharmaceuticalComponent"), dcbSubstanceId: text("dcbSubstanceId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthMaterialProfile_materialId_key").on(t.materialId), uniqueIndex("HealthMaterialProfile_barcode_key").on(t.barcode)]);
export const healthDcbSubstances = pgTable("HealthDcbSubstance", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), casNumber: text("casNumber").notNull(), version: text("version").notNull(), sourceReference: text("sourceReference").notNull(), isActive: boolean("isActive").notNull().default(true), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthDcbSubstance_code_version_key").on(t.code, t.version)]);
export const healthCatmatUnitMappings = pgTable("HealthCatmatUnitMapping", {
  id: id(), profileId: text("profileId").notNull(), localUnitCode: text("localUnitCode").notNull(), officialUnitCode: text("officialUnitCode").notNull(), localUnitsPerOfficial: doublePrecision("localUnitsPerOfficial").notNull(), reference: text("reference").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthCatmatUnitMapping_profileId_officialUnitCode_key").on(t.profileId, t.officialUnitCode)]);
export const medicineDispensations = pgTable("MedicineDispensation", {
  id: id(), date: time("date").notNull().defaultNow(), quantity: doublePrecision("quantity").notNull(), medicineId: text("medicineId").notNull(), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), batchId: text("batchId"), prescriptionItemId: text("prescriptionItemId"), warehouseId: text("warehouseId"), stockId: text("stockId"), movementId: text("movementId"), dispensedByProfessionalId: text("dispensedByProfessionalId"), dosageSnapshot: text("dosageSnapshot"), observation: text("observation"), nextWithdrawalAt: time("nextWithdrawalAt"), idempotencyKey: text("idempotencyKey"), specializedPlanId: text("specializedPlanId"), status: text("status").notNull().default("ACTIVE"), prescriptionType: text("prescriptionType").notNull().default("SIMPLE"), prescriberProfessionalId: text("prescriberProfessionalId"), receiverPersonId: text("receiverPersonId"), receiverRelationship: text("receiverRelationship"), cancelledAt: time("cancelledAt"), cancelledByUsuarioId: text("cancelledByUsuarioId"), cancellationReason: text("cancellationReason"), reversalMovementId: text("reversalMovementId"), judicialCaseItemId: text("judicialCaseItemId"), kitDeliveryItemId: text("kitDeliveryItemId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("MedicineDispensation_idempotencyKey_key").on(t.idempotencyKey), uniqueIndex("MedicineDispensation_movementId_key").on(t.movementId), uniqueIndex("MedicineDispensation_reversalMovementId_key").on(t.reversalMovementId), uniqueIndex("MedicineDispensation_kitDeliveryItemId_key").on(t.kitDeliveryItemId)]);
export const healthDispensationEvents = pgTable("HealthDispensationEvent", {
  id: id(), dispensationId: text("dispensationId").notNull(), kind: text("kind").notNull(), reason: text("reason").notNull(), snapshot: jsonb("snapshot").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const pharmacyRequests = pgTable("PharmacyRequest", {
  id: id(), idempotencyKey: text("idempotencyKey"), originWarehouseId: text("originWarehouseId"), patientId: text("patientId"), destinationWarehouseId: text("destinationWarehouseId").notNull(), status: text("status").notNull().default("OPEN"), requestedAt: time("requestedAt").notNull().defaultNow(), fulfilledAt: time("fulfilledAt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), notes: text("notes"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("PharmacyRequest_idempotencyKey_key").on(t.idempotencyKey)]);
export const pharmacyRequestItems = pgTable("PharmacyRequestItem", {
  id: id(), requestId: text("requestId").notNull(), materialId: text("materialId").notNull(), requestedQuantity: doublePrecision("requestedQuantity").notNull(), fulfilledQuantity: doublePrecision("fulfilledQuantity").notNull().default(0), createdAt: createdAt(),
}, t => [uniqueIndex("PharmacyRequestItem_requestId_materialId_key").on(t.requestId, t.materialId)]);
export const pharmacyRequestFulfillments = pgTable("PharmacyRequestFulfillment", {
  id: id(), requestItemId: text("requestItemId").notNull(), quantity: doublePrecision("quantity").notNull(), movementId: text("movementId").notNull(), dispensationId: text("dispensationId"), transferItemId: text("transferItemId"), receiverPersonId: text("receiverPersonId"), status: text("status").notNull().default("ACTIVE"), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), cancelledAt: time("cancelledAt"), createdAt: createdAt(),
}, t => [uniqueIndex("PharmacyRequestFulfillment_movementId_key").on(t.movementId), uniqueIndex("PharmacyRequestFulfillment_dispensationId_key").on(t.dispensationId), uniqueIndex("PharmacyRequestFulfillment_transferItemId_key").on(t.transferItemId)]);
export const pharmacyRequestEvents = pgTable("PharmacyRequestEvent", {
  id: id(), requestId: text("requestId").notNull(), status: text("status").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthPharmacyLawyers = pgTable("HealthPharmacyLawyer", {
  id: id(), personId: text("personId").notNull(), registration: text("registration").notNull(), registrationState: text("registrationState").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex("HealthPharmacyLawyer_personId_key").on(t.personId), uniqueIndex("HealthPharmacyLawyer_registration_registrationState_key").on(t.registration, t.registrationState)]);
export const healthPharmacyJudicialCases = pgTable("HealthPharmacyJudicialCase", {
  id: id(), caseNumber: text("caseNumber").notNull(), version: integer("version").notNull().default(1), patientId: text("patientId").notNull(), unitId: text("unitId").notNull(), lawyerId: text("lawyerId").notNull(), openedAt: time("openedAt").notNull(), validUntil: time("validUntil").notNull(), reason: text("reason").notNull(), processId: text("processId"), purchaseRequestId: text("purchaseRequestId"), status: text("status").notNull().default("OPEN"), renewalOfId: text("renewalOfId"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthPharmacyJudicialCase_caseNumber_version_key").on(t.caseNumber, t.version)]);
export const healthPharmacyJudicialItems = pgTable("HealthPharmacyJudicialItem", {
  id: id(), caseId: text("caseId").notNull(), medicineId: text("medicineId").notNull(), quantity: doublePrecision("quantity").notNull(), dosage: text("dosage").notNull(), prescriptionItemId: text("prescriptionItemId"),
}, t => [uniqueIndex("HealthPharmacyJudicialItem_caseId_medicineId_key").on(t.caseId, t.medicineId)]);
export const healthPharmacyJudicialEvents = pgTable("HealthPharmacyJudicialEvent", {
  id: id(), caseId: text("caseId").notNull(), fromStatus: text("fromStatus"), toStatus: text("toStatus").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthPharmacyJudicialDocuments = pgTable("HealthPharmacyJudicialDocument", {
  id: id(), caseId: text("caseId").notNull(), documentId: text("documentId").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("HealthPharmacyJudicialDocument_caseId_documentId_key").on(t.caseId, t.documentId)]);
export const healthPharmacyKits = pgTable("HealthPharmacyKit", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), version: integer("version").notNull().default(1), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthPharmacyKit_code_key").on(t.code)]);
export const healthPharmacyKitItems = pgTable("HealthPharmacyKitItem", {
  id: id(), kitId: text("kitId").notNull(), materialId: text("materialId").notNull(), quantity: doublePrecision("quantity").notNull(),
}, t => [uniqueIndex("HealthPharmacyKitItem_kitId_materialId_key").on(t.kitId, t.materialId)]);
export const healthPharmacyKitDeliveries = pgTable("HealthPharmacyKitDelivery", {
  id: id(), kitId: text("kitId").notNull(), kitVersion: integer("kitVersion").notNull(), patientId: text("patientId").notNull(), warehouseId: text("warehouseId").notNull(), status: text("status").notNull().default("GENERATED"), criteria: jsonb("criteria").notNull(), sourceSnapshot: jsonb("sourceSnapshot").notNull(), receiverPersonId: text("receiverPersonId"), receiverRelationship: text("receiverRelationship"), generatedByUsuarioId: text("generatedByUsuarioId").notNull(), deliveredAt: time("deliveredAt"), deliveredByUsuarioId: text("deliveredByUsuarioId"), returnedAt: time("returnedAt"), returnedByUsuarioId: text("returnedByUsuarioId"), idempotencyKey: text("idempotencyKey").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthPharmacyKitDelivery_idempotencyKey_key").on(t.idempotencyKey)]);
export const healthPharmacyKitDeliveryItems = pgTable("HealthPharmacyKitDeliveryItem", {
  id: id(), deliveryId: text("deliveryId").notNull(), materialId: text("materialId").notNull(), quantity: doublePrecision("quantity").notNull(), prescriptionItemId: text("prescriptionItemId"), stockId: text("stockId"), movementId: text("movementId"), reversalMovementId: text("reversalMovementId"),
}, t => [uniqueIndex("HealthPharmacyKitDeliveryItem_deliveryId_materialId_key").on(t.deliveryId, t.materialId), uniqueIndex("HealthPharmacyKitDeliveryItem_movementId_key").on(t.movementId), uniqueIndex("HealthPharmacyKitDeliveryItem_reversalMovementId_key").on(t.reversalMovementId)]);
export const healthPharmacyKitEvents = pgTable("HealthPharmacyKitEvent", {
  id: id(), deliveryId: text("deliveryId").notNull(), status: text("status").notNull(), reason: text("reason").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});

// Read-only cross-owner projections: writers remain with Saúde.
export const pharmacyStockReceipts = pgTable("HealthStockReceipt", { id: text("id").primaryKey(), invoiceKey: text("invoiceKey"), warehouseId: text("warehouseId").notNull() });
export const pharmacyStockTransfers = pgTable("HealthStockTransfer", { id: text("id").primaryKey(), status: text("status").notNull() });
export const pharmacyStockTransferItems = pgTable("HealthStockTransferItem", { id: text("id").primaryKey(), transferId: text("transferId").notNull(), pharmacyRequestItemId: text("pharmacyRequestItemId"), quantity: doublePrecision("quantity").notNull() });
export const pharmacyVaccines = pgTable("Vaccine", { id: text("id").primaryKey(), materialId: text("materialId") });
