import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthRegulationQuotas = pgTable("HealthRegulationQuota", {
  id: id(), providerSupplierId: text("providerSupplierId").notNull(), unitId: text("unitId"), specialtyId: text("specialtyId"), serviceId: text("serviceId"), procedureId: text("procedureId"), period: text("period").notNull(), totalQuantity: integer("totalQuantity").notNull(), reservedQuantity: integer("reservedQuantity").notNull().default(0), realizedQuantity: integer("realizedQuantity").notNull().default(0), unitValue: exactNumeric("unitValue", { precision: 14, scale: 2 }), convenioId: text("convenioId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthRegulationQuotaAllocations = pgTable("HealthRegulationQuotaAllocation", {
  id: id(), quotaId: text("quotaId").notNull(), requestUnitId: text("requestUnitId").notNull(), totalQuantity: integer("totalQuantity").notNull(), reservedQuantity: integer("reservedQuantity").notNull().default(0), realizedQuantity: integer("realizedQuantity").notNull().default(0), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthRegulationQuotaAllocation_quotaId_requestUnitId_key").on(t.quotaId, t.requestUnitId)]);
export const healthRegulationRequests = pgTable("HealthRegulationRequest", {
  id: id(), appointmentId: text("appointmentId"), patientId: text("patientId").notNull(), requestUnitId: text("requestUnitId"), professionalId: text("professionalId"), specialtyId: text("specialtyId"), serviceId: text("serviceId"), procedureId: text("procedureId"), priority: text("priority").notNull().default("Normal"), status: text("status").notNull().default("RECEBIDA"), origin: text("origin").notNull().default("DIRECT"), referralId: text("referralId"), examRequestId: text("examRequestId"), description: text("description"), quotaId: text("quotaId"), sectorId: text("sectorId"), protocolNumber: text("protocolNumber"), validationCode: text("validationCode"), cidReferenceId: text("cidReferenceId"), patientCondition: text("patientCondition"), executorNotes: text("executorNotes"), transportNotes: text("transportNotes"), isExternal: boolean("isExternal").notNull().default(false), observations: text("observations"), preparation: text("preparation"), contactPhone: text("contactPhone"), feedback: text("feedback"), guideNumber: text("guideNumber"), guideIssuedAt: timestamp("guideIssuedAt", { precision: 3 }), guideDocumentId: text("guideDocumentId"), scheduledAt: timestamp("scheduledAt", { precision: 3 }), executedAt: timestamp("executedAt", { precision: 3 }), returnedAt: timestamp("returnedAt", { precision: 3 }), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthRegulationRequest_appointmentId_key").on(t.appointmentId), uniqueIndex("HealthRegulationRequest_referralId_key").on(t.referralId), uniqueIndex("HealthRegulationRequest_examRequestId_key").on(t.examRequestId), uniqueIndex("HealthRegulationRequest_protocolNumber_key").on(t.protocolNumber), uniqueIndex("HealthRegulationRequest_validationCode_key").on(t.validationCode), uniqueIndex("HealthRegulationRequest_guideNumber_key").on(t.guideNumber)]);
export const healthRegulationEvents = pgTable("HealthRegulationEvent", {
  id: id(), requestId: text("requestId").notNull(), fromStatus: text("fromStatus").notNull(), toStatus: text("toStatus").notNull(), eventType: text("eventType").notNull(), notes: text("notes"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthRegulationSectors = pgTable("HealthRegulationSector", {
  id: id(), name: text("name").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex("HealthRegulationSector_name_key").on(t.name)]);
export const healthRegulationAttachments = pgTable("HealthRegulationAttachment", {
  id: id(), requestId: text("requestId").notNull(), documentId: text("documentId").notNull(), uploadedByUsuarioId: text("uploadedByUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthRegulationReviews = pgTable("HealthRegulationReview", {
  id: id(), requestId: text("requestId").notNull(), step: text("step").notNull(), decision: text("decision").notNull(), priority: text("priority").notNull(), notes: text("notes").notNull(), professionalId: text("professionalId"), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: createdAt(),
});
export const healthCallPanels = pgTable("HealthCallPanel", {
  id: id(), unitId: text("unitId").notNull(), sector: text("sector").notNull(), title: text("title").notNull(), callMessage: text("callMessage").notNull(), news: text("news").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthCallPanel_unitId_sector_key").on(t.unitId, t.sector)]);
export const healthPanelCalls = pgTable("HealthPanelCall", {
  id: id(), panelId: text("panelId").notNull(), patientId: text("patientId").notNull(), appointmentId: text("appointmentId"), pharmacyRequestId: text("pharmacyRequestId"), message: text("message").notNull(), actorUsuarioId: text("actorUsuarioId").notNull(), calledAt: timestamp("calledAt", { precision: 3 }).notNull().defaultNow(),
});
export const healthProviderAccesses = pgTable("HealthProviderAccess", {
  id: id(), supplierId: text("supplierId").notNull(), usuarioId: text("usuarioId").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthProviderAccess_supplierId_usuarioId_key").on(t.supplierId, t.usuarioId)]);
