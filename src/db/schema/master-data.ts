import { boolean, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { people } from "./people";
import { companies, documents } from "./registry";
import { administrativeUnits, departments, employees, secretariats } from "./administration";

function timestamps() {
  return {
    id: text("id").primaryKey().$defaultFn(createId),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  };
}

export const families = pgTable("Family", {
  ...timestamps(), code: text("code"), responsiblePersonId: text("responsiblePersonId").references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }), status: text("status").notNull().default("ATIVA"),
}, table => [uniqueIndex("Family_code_key").on(table.code)]);

export const familyMembers = pgTable("FamilyMember", {
  ...timestamps(), familyId: text("familyId").notNull().references(() => families.id, { onDelete: "cascade", onUpdate: "cascade" }), personId: text("personId").notNull().references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }),
  kinship: text("kinship"), isRepresentative: boolean("isRepresentative").notNull().default(false), joinedAt: timestamp("joinedAt", { precision: 3 }), leftAt: timestamp("leftAt", { precision: 3 }), status: text("status").notNull().default("ATIVO"),
}, table => [uniqueIndex("FamilyMember_familyId_personId_key").on(table.familyId, table.personId)]);

export const governmentEntities = pgTable("GovernmentEntity", {
  ...timestamps(), code: text("code").notNull(), name: text("name").notNull(), type: text("type").notNull(), cnpj: text("cnpj"),
  companyId: text("companyId").references(() => companies.id, { onDelete: "restrict", onUpdate: "cascade" }), parentId: text("parentId").references((): AnyPgColumn => governmentEntities.id, { onDelete: "restrict", onUpdate: "cascade" }), status: text("status").notNull().default("ATIVA"),
}, table => [uniqueIndex("GovernmentEntity_code_key").on(table.code), uniqueIndex("GovernmentEntity_cnpj_key").on(table.cnpj), uniqueIndex("GovernmentEntity_companyId_key").on(table.companyId)]);

export const costCenters = pgTable("CostCenter", {
  ...timestamps(), code: text("code").notNull(), name: text("name").notNull(), description: text("description"), isActive: boolean("isActive").notNull().default(true),
  governmentEntityId: text("governmentEntityId").references(() => governmentEntities.id, { onDelete: "restrict", onUpdate: "cascade" }), parentId: text("parentId").references((): AnyPgColumn => costCenters.id, { onDelete: "restrict", onUpdate: "cascade" }),
  secretariatId: text("secretariatId").references(() => secretariats.id, { onDelete: "restrict", onUpdate: "cascade" }), departmentId: text("departmentId").references(() => departments.id, { onDelete: "restrict", onUpdate: "cascade" }), administrativeUnitId: text("administrativeUnitId").references(() => administrativeUnits.id, { onDelete: "restrict", onUpdate: "cascade" }),
}, table => [uniqueIndex("CostCenter_code_key").on(table.code)]);

export const banks = pgTable("Bank", {
  ...timestamps(), compe: text("compe").notNull(), ispb: text("ispb").notNull(), name: text("name").notNull(), shortName: text("shortName").notNull(), status: text("status").notNull().default("ATIVO"),
}, table => [uniqueIndex("Bank_compe_key").on(table.compe), uniqueIndex("Bank_ispb_key").on(table.ispb)]);

export const bankBranches = pgTable("BankBranch", {
  ...timestamps(), bankId: text("bankId").notNull().references(() => banks.id, { onDelete: "restrict", onUpdate: "cascade" }), code: text("code").notNull(), name: text("name").notNull(), cnpj: text("cnpj"), cityId: text("cityId"), status: text("status").notNull().default("ATIVA"),
}, table => [uniqueIndex("BankBranch_bankId_code_key").on(table.bankId, table.code)]);

export const currencies = pgTable("Currency", {
  ...timestamps(), isoCode: text("isoCode").notNull(), name: text("name").notNull(), symbol: text("symbol").notNull(), decimalPlaces: integer("decimalPlaces").notNull().default(2), status: text("status").notNull().default("ATIVA"), isDefault: boolean("isDefault").notNull().default(false),
}, table => [uniqueIndex("Currency_isoCode_key").on(table.isoCode)]);

export const catalogItems = pgTable("CatalogItem", {
  ...timestamps(), code: text("code"), name: text("name").notNull(), description: text("description"), unit: text("unit").notNull().default("UN"), category: text("category"), estimatedValue: doublePrecision("estimatedValue"), isActive: boolean("isActive").notNull().default(true), productKind: text("productKind").notNull().default("MATERIAL"), specification: text("specification"), externalCode: text("externalCode"),
}, table => [uniqueIndex("CatalogItem_code_key").on(table.code)]);

export const healthCbos = pgTable("HealthCbo", {
  ...timestamps(), code: text("code").notNull(), description: text("description").notNull(), isActive: boolean("isActive").notNull().default(true),
}, table => [uniqueIndex("HealthCbo_code_key").on(table.code)]);

export const taxes = pgTable("Tax", {
  ...timestamps(), name: text("name").notNull(), taxType: text("taxType").notNull(), isActive: boolean("isActive").notNull().default(true), code: text("code"), governmentLevel: text("governmentLevel"), revenueNature: text("revenueNature"), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }), description: text("description"),
}, table => [uniqueIndex("Tax_code_key").on(table.code)]);

export const legalTexts = pgTable("LegalText", {
  ...timestamps(), type: text("type").notNull(), number: text("number").notNull(), summary: text("summary").notNull(), governmentLevel: text("governmentLevel").notNull(), issuingBody: text("issuingBody").notNull(), publicationDate: timestamp("publicationDate", { precision: 3 }), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }), status: text("status").notNull().default("VIGENTE"), governmentEntityId: text("governmentEntityId").references(() => governmentEntities.id, { onDelete: "restrict", onUpdate: "cascade" }),
}, table => [uniqueIndex("LegalText_type_number_governmentLevel_issuingBody_key").on(table.type, table.number, table.governmentLevel, table.issuingBody)]);

export const legalTextVersions = pgTable("LegalTextVersion", {
  ...timestamps(), legalTextId: text("legalTextId").notNull().references(() => legalTexts.id, { onDelete: "cascade", onUpdate: "cascade" }), versionNumber: integer("versionNumber").notNull(), content: text("content").notNull(), summary: text("summary"), publicationDate: timestamp("publicationDate", { precision: 3 }), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }), status: text("status").notNull().default("VIGENTE"), documentId: text("documentId").references(() => documents.id, { onDelete: "restrict", onUpdate: "cascade" }),
}, table => [uniqueIndex("LegalTextVersion_legalTextId_versionNumber_key").on(table.legalTextId, table.versionNumber), uniqueIndex("LegalTextVersion_documentId_key").on(table.documentId)]);

export const legalReportSigners = pgTable("LegalReportSigner", {
  ...timestamps(), personId: text("personId").references(() => people.id, { onDelete: "restrict", onUpdate: "cascade" }), employeeId: text("employeeId").references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), governmentEntityId: text("governmentEntityId").references(() => governmentEntities.id, { onDelete: "restrict", onUpdate: "cascade" }), signingRole: text("signingRole").notNull(), reportTypes: text("reportTypes").array().notNull().default([]), signatureOrder: integer("signatureOrder").notNull().default(1), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull(), effectiveUntil: timestamp("effectiveUntil", { precision: 3 }), status: text("status").notNull().default("ATIVO"),
});

export const consistencyRuns = pgTable("MasterDataConsistencyRun", {
  ...timestamps(), area: text("area").notNull(), runType: text("runType").notNull(), status: text("status").notNull().default("EM_EXECUCAO"), startedAt: timestamp("startedAt", { precision: 3 }).notNull().defaultNow(), completedAt: timestamp("completedAt", { precision: 3 }),
});

export const consistencyIssues = pgTable("MasterDataConsistencyIssue", {
  ...timestamps(), runId: text("runId").notNull().references(() => consistencyRuns.id, { onDelete: "cascade", onUpdate: "cascade" }), area: text("area").notNull(), issueType: text("issueType").notNull(), recordType: text("recordType").notNull(), recordId: text("recordId").notNull(), severity: text("severity").notNull(), description: text("description").notNull(), status: text("status").notNull().default("ABERTA"), detectedAt: timestamp("detectedAt", { precision: 3 }).notNull().defaultNow(), resolvedAt: timestamp("resolvedAt", { precision: 3 }),
});
