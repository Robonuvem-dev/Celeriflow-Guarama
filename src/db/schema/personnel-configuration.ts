import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { Decimal, exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

export const hrPayrollRuleSets = pgTable("HrPayrollRuleSet", {
  id: text("id").primaryKey().$defaultFn(createId), configuracaoInstanciaId: text("configuracaoInstanciaId").notNull(), code: text("code").notNull(), name: text("name").notNull(),
  status: text("status").notNull().default("RASCUNHO"), scope: text("scope").notNull().default("DEMONSTRACAO"),
  effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull(), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }),
  legalReference: text("legalReference"), notes: text("notes"), isDemo: boolean("isDemo").notNull().default(true),
  approvedAt: timestamp("approvedAt", { precision: 3 }), archivedAt: timestamp("archivedAt", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("HrPayrollRuleSet_configuracaoInstanciaId_code_effectiveFrom_key").on(t.configuracaoInstanciaId, t.code, t.effectiveFrom)]);
export const hrPayrollRules = pgTable("HrPayrollRule", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull(), category: text("category").notNull(), code: text("code").notNull(), name: text("name").notNull(),
  description: text("description"), valueType: text("valueType").notNull(), value: jsonb("value").$type<JsonValue>().notNull(), unit: text("unit"),
  sortOrder: integer("sortOrder").notNull().default(100), legalReference: text("legalReference"), isRequired: boolean("isRequired").notNull().default(false), isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("HrPayrollRule_ruleSetId_code_key").on(t.ruleSetId, t.code)]);
export const hrPayrollConfigurationChanges = pgTable("HrPayrollConfigurationChange", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull(), entityType: text("entityType").notNull(), entityId: text("entityId").notNull(), operation: text("operation").notNull(), beforeValue: jsonb("beforeValue").$type<JsonValue>(), afterValue: jsonb("afterValue").$type<JsonValue>(), actorUsuarioId: text("actorUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const hrVacationPolicies = pgTable("HrVacationPolicy", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull(), code: text("code").notNull(), name: text("name").notNull(), employmentNature: text("employmentNature").notNull(), acquisitionMonths: integer("acquisitionMonths").notNull().default(12), concessionMonths: integer("concessionMonths").notNull().default(12), entitlementDays: integer("entitlementDays").notNull().default(30), maxSplits: integer("maxSplits").notNull().default(3), minFirstSplitDays: integer("minFirstSplitDays").notNull().default(14), minOtherSplitDays: integer("minOtherSplitDays").notNull().default(5), additionalPayRate: exactNumeric("additionalPayRate", { precision: 9, scale: 6 }).notNull().default(new Decimal("33.333333")), allowsCashAbono: boolean("allowsCashAbono").notNull().default(false), maxCashAbonoDays: integer("maxCashAbonoDays").notNull().default(0), allowsAdvanceThirteenth: boolean("allowsAdvanceThirteenth").notNull().default(false), requiresApproval: boolean("requiresApproval").notNull().default(true), legalReference: text("legalReference"), notes: text("notes"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("HrVacationPolicy_ruleSetId_code_key").on(t.ruleSetId, t.code)]);
export const hrEmploymentRegimes = pgTable("HrEmploymentRegime", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull(), code: text("code").notNull(), name: text("name").notNull(), employmentNature: text("employmentNature").notNull(), esocialCategory: text("esocialCategory"), defaultMonthlyHours: integer("defaultMonthlyHours"), socialSecuritySchemeId: text("socialSecuritySchemeId"), vacationPolicyId: text("vacationPolicyId"), legalReference: text("legalReference"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("HrEmploymentRegime_ruleSetId_code_key").on(t.ruleSetId, t.code)]);
export const hrCalculationPolicies = pgTable("HrCalculationPolicy", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull().unique(), currency: text("currency").notNull().default("BRL"), roundingMode: text("roundingMode").notNull().default("HALF_UP"), roundingScale: integer("roundingScale").notNull().default(2), movementCutoffDay: integer("movementCutoffDay").notNull().default(20), paymentDay: integer("paymentDay"), negativeNetPayPolicy: text("negativeNetPayPolicy").notNull().default("BLOQUEAR"), maxConsignmentMarginRate: exactNumeric("maxConsignmentMarginRate", { precision: 9, scale: 6 }), remunerationCeiling: exactNumeric("remunerationCeiling", { precision: 18, scale: 2 }), freezeOnClose: boolean("freezeOnClose").notNull().default(true), legalReference: text("legalReference"), notes: text("notes"), ...timestamps(),
});
export const hrPayrollRubrics = pgTable("HrPayrollRubric", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull(), code: text("code").notNull(), name: text("name").notNull(), type: text("type").notNull(), esocialNatureCode: text("esocialNatureCode"), calculationMethod: text("calculationMethod").notNull().default("MANUAL"), formulaExpression: text("formulaExpression"), calculationBaseCode: text("calculationBaseCode"), fixedValue: exactNumeric("fixedValue", { precision: 18, scale: 2 }), percentageRate: exactNumeric("percentageRate", { precision: 9, scale: 6 }), priority: integer("priority").notNull().default(100), legalReference: text("legalReference"), notes: text("notes"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("HrPayrollRubric_ruleSetId_code_key").on(t.ruleSetId, t.code)]);
export const hrPayrollRubricIncidences = pgTable("HrPayrollRubricIncidence", {
  id: text("id").primaryKey().$defaultFn(createId), rubricId: text("rubricId").notNull(), incidenceType: text("incidenceType").notNull(), isIncluded: boolean("isIncluded").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("HrPayrollRubricIncidence_rubricId_incidenceType_key").on(t.rubricId, t.incidenceType)]);
export const hrSocialSecuritySchemes = pgTable("HrSocialSecurityScheme", {
  id: text("id").primaryKey().$defaultFn(createId), ruleSetId: text("ruleSetId").notNull(), code: text("code").notNull(), name: text("name").notNull(), regime: text("regime").notNull(), employeeCalculationMethod: text("employeeCalculationMethod").notNull().default("PROGRESSIVA"), ceilingValue: exactNumeric("ceilingValue", { precision: 18, scale: 2 }), employerContributionRate: exactNumeric("employerContributionRate", { precision: 9, scale: 6 }), actuarialContributionRate: exactNumeric("actuarialContributionRate", { precision: 9, scale: 6 }), legalReference: text("legalReference"), notes: text("notes"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("HrSocialSecurityScheme_ruleSetId_code_key").on(t.ruleSetId, t.code)]);
export const hrSocialSecurityBands = pgTable("HrSocialSecurityBand", {
  id: text("id").primaryKey().$defaultFn(createId), socialSecuritySchemeId: text("socialSecuritySchemeId").notNull(), sequence: integer("sequence").notNull(), lowerLimit: exactNumeric("lowerLimit", { precision: 18, scale: 2 }).notNull(), upperLimit: exactNumeric("upperLimit", { precision: 18, scale: 2 }), employeeRate: exactNumeric("employeeRate", { precision: 9, scale: 6 }).notNull(), employerRate: exactNumeric("employerRate", { precision: 9, scale: 6 }), ...timestamps(),
}, t => [uniqueIndex("HrSocialSecurityBand_socialSecuritySchemeId_sequence_key").on(t.socialSecuritySchemeId, t.sequence)]);
