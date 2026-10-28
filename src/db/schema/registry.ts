import { doublePrecision, integer, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { people } from "./people";

export const companies = pgTable("Company", {
  id: text("id").primaryKey().$defaultFn(createId), corporateName: text("corporateName").notNull(), tradeName: text("tradeName"), cnpj: text("cnpj").notNull(),
  municipalInsc: text("municipalInsc"), stateInsc: text("stateInsc"), companyType: text("companyType"), legalNature: text("legalNature"),
  primaryCnae: text("primaryCnae"), secondaryCnaes: text("secondaryCnaes"), openingDate: timestamp("openingDate", { precision: 3 }), taxRegime: text("taxRegime"),
  status: text("status").notNull().default("Ativo"), phone: text("phone"), whatsapp: text("whatsapp"), emailPrimary: text("emailPrimary"), emailFiscal: text("emailFiscal"), website: text("website"), contactPerson: text("contactPerson"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("Company_cnpj_key").on(table.cnpj)]);

export const taxpayers = pgTable("Taxpayer", {
  id: text("id").primaryKey().$defaultFn(createId), taxpayerType: text("taxpayerType").notNull(), municipalInsc: text("municipalInsc"),
  status: text("status").notNull().default("Ativo"), economicActivities: text("economicActivities"), fiscalNotes: text("fiscalNotes"),
  personId: text("personId").references(() => people.id, { onDelete: "cascade", onUpdate: "cascade" }),
  companyId: text("companyId").references(() => companies.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("Taxpayer_personId_key").on(table.personId), uniqueIndex("Taxpayer_companyId_key").on(table.companyId), uniqueIndex("Taxpayer_municipalInsc_key").on(table.municipalInsc)]);

export const suppliers = pgTable("Supplier", {
  id: text("id").primaryKey().$defaultFn(createId), category: text("category"), businessBranch: text("businessBranch"), bankData: text("bankData"),
  certificationsValidUntil: timestamp("certificationsValidUntil", { precision: 3 }), status: text("status").notNull().default("Ativo"), notes: text("notes"),
  personId: text("personId").references(() => people.id, { onDelete: "cascade", onUpdate: "cascade" }),
  companyId: text("companyId").references(() => companies.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("Supplier_personId_key").on(table.personId), uniqueIndex("Supplier_companyId_key").on(table.companyId)]);

export const addresses = pgTable("Address", {
  id: text("id").primaryKey().$defaultFn(createId), zipCode: text("zipCode"), streetName: text("streetName"), number: text("number"), complement: text("complement"), referencePoint: text("referencePoint"),
  addressType: text("addressType"), zone: text("zone"), latitude: doublePrecision("latitude"), longitude: doublePrecision("longitude"), neighborhoodId: text("neighborhoodId"), streetId: text("streetId"),
  canonicalAddressId: text("canonicalAddressId").references((): AnyPgColumn => addresses.id, { onDelete: "restrict", onUpdate: "cascade" }),
  personId: text("personId").references(() => people.id, { onDelete: "cascade", onUpdate: "cascade" }),
  companyId: text("companyId").references(() => companies.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const realEstates = pgTable("RealEstate", {
  id: text("id").primaryKey().$defaultFn(createId), municipalInsc: text("municipalInsc"), registration: text("registration"), propertyType: text("propertyType"), status: text("status").notNull().default("Regular"),
  streetName: text("streetName"), number: text("number"), complement: text("complement"), lot: text("lot"), block: text("block"), landArea: doublePrecision("landArea"), builtArea: doublePrecision("builtArea"),
  propertyUse: text("propertyUse"), fiscalZone: text("fiscalZone"), neighborhoodId: text("neighborhoodId"), streetId: text("streetId"), taxpayerId: text("taxpayerId").references(() => taxpayers.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("RealEstate_municipalInsc_key").on(table.municipalInsc)]);

export const documents = pgTable("Document", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), documentType: text("documentType").notNull(), fileUrl: text("fileUrl").notNull(), validUntil: timestamp("validUntil", { precision: 3 }),
  status: text("status").notNull().default("VÃ¡lido"), notes: text("notes"), documentClassId: text("documentClassId"), publicLabel: text("publicLabel").notNull().default("Documento autenticado"), retentionMonths: integer("retentionMonths").notNull().default(60),
  personId: text("personId").references(() => people.id, { onDelete: "cascade", onUpdate: "cascade" }), companyId: text("companyId").references(() => companies.id, { onDelete: "cascade", onUpdate: "cascade" }), folderId: text("folderId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
