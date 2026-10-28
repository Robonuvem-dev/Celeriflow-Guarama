import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

const id = () => text("id").primaryKey().$defaultFn(createId);
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
const at = (name: string) => timestamp(name, { precision: 3 });
// Existing Finance legacy workflow objects; adopted pieces remain protected by
// the PlanningInstrument/PlanningCreditBatch ownership guards in the service.
export const financeCmdSchedules = pgTable("MonthlyDisbursementSchedule", { id: id(), annualBudgetLawId: text("annualBudgetLawId").notNull(), month: integer("month").notNull(), budgetUnitId: text("budgetUnitId").notNull(), limitValue: money("limitValue").notNull() }, t => [uniqueIndex("MonthlyDisbursementSchedule_annualBudgetLawId_month_budgetUnitId_key").on(t.annualBudgetLawId, t.month, t.budgetUnitId)]);
export const financeMbaTargets = pgTable("BimonthlyRevenueTarget", { id: id(), annualBudgetLawId: text("annualBudgetLawId").notNull(), bimonth: integer("bimonth").notNull(), targetValue: money("targetValue").notNull() }, t => [uniqueIndex("BimonthlyRevenueTarget_annualBudgetLawId_bimonth_key").on(t.annualBudgetLawId, t.bimonth)]);
export const financeCreditRequests = pgTable("CreditRequest", {
  id: id(), number: text("number").notNull(), financialYearId: text("financialYearId").notNull(), legalActNumber: text("legalActNumber"), legalActDate: at("legalActDate"), legalDocumentId: text("legalDocumentId"), fundingSourceId: text("fundingSourceId"), publicationDate: at("publicationDate"), publicationReference: text("publicationReference"), type: text("type").notNull(), lawNumber: text("lawNumber"), justification: text("justification").notNull(), totalValue: money("totalValue").notNull(), status: text("status").notNull().default("DRAFT"), requestedById: text("requestedById").notNull(), submittedById: text("submittedById"), submittedAt: at("submittedAt"), approvedById: text("approvedById"), approvedAt: at("approvedAt"), sanctionedById: text("sanctionedById"), sanctionedAt: at("sanctionedAt"), publishedById: text("publishedById"), publishedAt: at("publishedAt"), executedById: text("executedById"), executedAt: at("executedAt"), createdAt: at("createdAt").notNull().defaultNow(), updatedAt: at("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("CreditRequest_number_key").on(t.number)]);
export const financeCreditItems = pgTable("CreditRequestItem", { id: id(), creditRequestId: text("creditRequestId").notNull(), appropriationId: text("appropriationId").notNull(), type: text("type").notNull(), value: money("value").notNull() });
export const financePlanningAmendments = pgTable("PlanningAmendment", { id: id(), entityType: text("entityType").notNull(), entityId: text("entityId").notNull(), version: integer("version").notNull(), reason: text("reason").notNull(), originalSnapshot: jsonb("originalSnapshot").$type<JsonValue>().notNull(), amendedSnapshot: jsonb("amendedSnapshot").$type<JsonValue>().notNull(), authorUsuarioId: text("authorUsuarioId").notNull(), createdAt: at("createdAt").notNull().defaultNow() }, t => [uniqueIndex("PlanningAmendment_entityType_entityId_version_key").on(t.entityType, t.entityId, t.version)]);
