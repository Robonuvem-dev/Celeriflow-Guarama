import { boolean, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

function timestamps() {
  return {
    id: text("id").primaryKey().$defaultFn(createId),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  };
}

export const purchaseProcesses = pgTable("PurchaseProcess", {
  ...timestamps(), number: text("number").notNull(), object: text("object").notNull(), type: text("type").notNull(),
  modality: text("modality"), estimatedValue: doublePrecision("estimatedValue"), status: text("status").notNull().default("Em Planejamento"),
  secretariatId: text("secretariatId").notNull(), purchaseRequestId: text("purchaseRequestId"),
}, table => [uniqueIndex("PurchaseProcess_number_key").on(table.number)]);

export const purchaseProcessItems = pgTable("PurchaseProcessItem", {
  ...timestamps(), purchaseProcessId: text("purchaseProcessId").notNull(), catalogItemId: text("catalogItemId"),
  customName: text("customName"), quantity: doublePrecision("quantity").notNull(), estimatedUnitValue: doublePrecision("estimatedUnitValue"), materialId: text("materialId"),
});

export const priceResearches = pgTable("PriceResearch", {
  ...timestamps(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), estimatedValue: doublePrecision("estimatedValue"),
  status: text("status").notNull().default("Em Andamento"), processId: text("processId").notNull(),
});

export const priceQuotes = pgTable("PriceQuote", {
  ...timestamps(), value: doublePrecision("value").notNull(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(),
  status: text("status").notNull().default("Ativa"), researchId: text("researchId").notNull(), supplierId: text("supplierId").notNull(),
});

export const biddings = pgTable("Bidding", {
  ...timestamps(), number: text("number").notNull(), modality: text("modality").notNull(), status: text("status").notNull().default("Em Elaboração"),
  publicationDate: timestamp("publicationDate", { precision: 3 }), sessionDate: timestamp("sessionDate", { precision: 3 }), processId: text("processId").notNull(),
}, table => [uniqueIndex("Bidding_number_key").on(table.number)]);

export const biddingLots = pgTable("BiddingLot", {
  ...timestamps(), biddingId: text("biddingId").notNull(), number: integer("number").notNull(), description: text("description"),
  status: text("status").notNull().default("Rascunho"), estimatedValueDecimal: exactNumeric("estimatedValueDecimal", { precision: 18, scale: 2 }),
  preliminaryTechnicalStudyId: text("preliminaryTechnicalStudyId"),
}, table => [uniqueIndex("BiddingLot_biddingId_number_key").on(table.biddingId, table.number)]);

export const biddingParticipants = pgTable("BiddingParticipant", {
  ...timestamps(), biddingId: text("biddingId").notNull(), supplierId: text("supplierId").notNull(), displayCode: text("displayCode"),
  status: text("status").notNull().default("Inscrito"), registeredAt: timestamp("registeredAt", { precision: 3 }).notNull().defaultNow(),
  notes: text("notes"), preliminaryTechnicalStudyId: text("preliminaryTechnicalStudyId"),
}, table => [uniqueIndex("BiddingParticipant_biddingId_supplierId_key").on(table.biddingId, table.supplierId), uniqueIndex("BiddingParticipant_biddingId_displayCode_key").on(table.biddingId, table.displayCode)]);

export const biddingResults = pgTable("BiddingResult", {
  ...timestamps(), biddingLotId: text("biddingLotId").notNull(), participantId: text("participantId").notNull(), biddingBidId: text("biddingBidId"),
  biddingActId: text("biddingActId"), status: text("status").notNull().default("Arrematado"), reason: text("reason"),
  unitValueDecimal: exactNumeric("unitValueDecimal", { precision: 18, scale: 2 }), totalValueDecimal: exactNumeric("totalValueDecimal", { precision: 18, scale: 2 }).notNull(),
  isCurrent: boolean("isCurrent").notNull().default(true), decidedByUsuarioId: text("decidedByUsuarioId").notNull(),
  decidedAt: timestamp("decidedAt", { precision: 3 }).notNull().defaultNow(), idempotencyKey: text("idempotencyKey").notNull(),
}, table => [uniqueIndex("BiddingResult_biddingActId_key").on(table.biddingActId), uniqueIndex("BiddingResult_idempotencyKey_key").on(table.idempotencyKey)]);

export const procurementContracts = pgTable("Contract", {
  ...timestamps(), number: text("number").notNull(), object: text("object").notNull(), initialValue: doublePrecision("initialValue").notNull(), updatedValue: doublePrecision("updatedValue").notNull(),
  startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }).notNull(), status: text("status").notNull().default("Minuta"),
  processId: text("processId").notNull(), supplierId: text("supplierId").notNull(), secretariatId: text("secretariatId").notNull(),
  sourceBudgetUnitId: text("sourceBudgetUnitId"), managerId: text("managerId"), inspectorId: text("inspectorId"),
}, table => [uniqueIndex("Contract_number_key").on(table.number)]);

export const directContractings = pgTable("DirectContracting", {
  ...timestamps(), type: text("type").notNull(), justification: text("justification").notNull(), value: doublePrecision("value").notNull(),
  status: text("status").notNull().default("Em Elaboração"), processId: text("processId").notNull(), supplierId: text("supplierId").notNull(),
});

export const contractAmendments = pgTable("ContractAmendment", {
  ...timestamps(), type: text("type").notNull(), justification: text("justification").notNull(), previousValue: doublePrecision("previousValue"), newValue: doublePrecision("newValue"),
  previousEndDate: timestamp("previousEndDate", { precision: 3 }), newEndDate: timestamp("newEndDate", { precision: 3 }),
  status: text("status").notNull().default("Minuta"), contractId: text("contractId").notNull(),
});

/** Read projection until the Planning owner publishes the complete budget schema. */
export const procurementBudgetUnits = pgTable("BudgetUnit", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
});
