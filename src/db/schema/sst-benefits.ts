import { boolean, date, doublePrecision, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@/db/ids";
import { exactNumeric } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
// Read projections of the canonical RH benefit/assignment, without DDL ownership.
export const sstBenefitConfigs = pgTable("BenefitConfig", {
  id: text("id").primaryKey(), name: text("name").notNull(), type: text("type").notNull(), baseValue: doublePrecision("baseValue").notNull().default(0), supplierId: text("supplierId"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const sstPayrollBenefits = pgTable("PayrollBenefit", {
  id: text("id").primaryKey(), employeeId: text("employeeId").notNull(), benefitConfigId: text("benefitConfigId").notNull(), customValue: doublePrecision("customValue"), status: text("status").notNull().default("Ativo"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const sstHealthPlans = pgTable("SstHealthPlan", {
  id: text("id").primaryKey().$defaultFn(createId), budgetUnitId: text("budgetUnitId").notNull(), benefitConfigId: text("benefitConfigId").notNull().unique(), supplierId: text("supplierId").notNull(), operatorCompanyId: text("operatorCompanyId").notNull(), ansPlanNumber: text("ansPlanNumber").notNull(), ansOperatorNumber: text("ansOperatorNumber").notNull(), monthlyRubricId: text("monthlyRubricId").notNull(), extraordinaryRubricId: text("extraordinaryRubricId").notNull(), monthlyEventId: text("monthlyEventId"), extraordinaryEventId: text("extraordinaryEventId"), contractReference: text("contractReference").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), createdById: text("createdById").notNull(), createdAt: createdAt(),
});
export const sstBeneficiaries = pgTable("SstBenefitBeneficiary", {
  id: text("id").primaryKey().$defaultFn(createId), planId: text("planId").notNull(), payrollBenefitId: text("payrollBenefitId").notNull(), dependentId: text("dependentId"), beneficiaryKey: text("beneficiaryKey").notNull(), admissionDate: date("admissionDate", { mode: "date" }).notNull(), startsAt: date("startsAt", { mode: "date" }).notNull(), endsAt: date("endsAt", { mode: "date" }).notNull(), cardNumber: text("cardNumber").notNull(), monthlyAmount: exactNumeric("monthlyAmount", { precision: 18, scale: 2 }).notNull(), contractReference: text("contractReference").notNull(), snapshot: jsonb("snapshot").$type<JsonValue>().notNull(), createdById: text("createdById").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("SstBenefitBeneficiary_payrollBenefitId_beneficiaryKey_startsAt_key").on(t.payrollBenefitId, t.beneficiaryKey, t.startsAt)]);
export const sstBenefitEntries = pgTable("SstBenefitEntry", {
  id: text("id").primaryKey().$defaultFn(createId), beneficiaryId: text("beneficiaryId").notNull(), competence: text("competence").notNull(), kind: text("kind").notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), sourceReference: text("sourceReference").notNull(), reason: text("reason").notNull(), refundOfId: text("refundOfId"), requestHash: text("requestHash").notNull(), candidateSnapshot: jsonb("candidateSnapshot").$type<JsonValue>().notNull(), createdById: text("createdById").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("SstBenefitEntry_beneficiaryId_sourceReference_key").on(t.beneficiaryId, t.sourceReference)]);
