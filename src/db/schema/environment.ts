import { boolean, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const environmentalEnterprises = pgTable("EnvEnterprise", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(), cnpjCpf: text("cnpjCpf"), activityType: text("activityType"),
  potentialRisk: text("potentialRisk"), address: text("address"), status: text("status").notNull().default("Ativo"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalLicenses = pgTable("EnvLicense", {
  id: text("id").primaryKey().$defaultFn(createId), licenseNumber: text("licenseNumber").notNull(), licenseType: text("licenseType").notNull(),
  issueDate: timestamp("issueDate", { precision: 3 }).notNull().defaultNow(), validUntil: timestamp("validUntil", { precision: 3 }),
  status: text("status").notNull().default("Emitida"),
  enterpriseId: text("enterpriseId").notNull().references(() => environmentalEnterprises.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("EnvLicense_licenseNumber_key").on(table.licenseNumber)]);

export const environmentalRequests = pgTable("EnvRequest", {
  id: text("id").primaryKey().$defaultFn(createId), requestType: text("requestType").notNull(), description: text("description").notNull(),
  address: text("address"), requesterName: text("requesterName"), status: text("status").notNull().default("Solicitado"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalComplaints = pgTable("EnvComplaint", {
  id: text("id").primaryKey().$defaultFn(createId), complaintType: text("complaintType").notNull(), description: text("description").notNull(),
  address: text("address"), isAnonymous: boolean("isAnonymous").notNull().default(true), status: text("status").notNull().default("Recebida"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalInspections = pgTable("EnvInspection", {
  id: text("id").primaryKey().$defaultFn(createId), dateScheduled: timestamp("dateScheduled", { precision: 3 }), dateExecuted: timestamp("dateExecuted", { precision: 3 }),
  inspector: text("inspector"), notes: text("notes"), status: text("status").notNull().default("Agendada"),
  enterpriseId: text("enterpriseId").references(() => environmentalEnterprises.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalInfractions = pgTable("EnvInfraction", {
  id: text("id").primaryKey().$defaultFn(createId), infractionType: text("infractionType").notNull(), description: text("description").notNull(),
  fineAmount: doublePrecision("fineAmount"), status: text("status").notNull().default("Emitido"),
  enterpriseId: text("enterpriseId").references(() => environmentalEnterprises.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const greenAreas = pgTable("EnvGreenArea", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), areaType: text("areaType").notNull(), sizeSqm: doublePrecision("sizeSqm"),
  location: text("location"), status: text("status").notNull().default("Preservado"), notes: text("notes"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalWastes = pgTable("EnvWaste", {
  id: text("id").primaryKey().$defaultFn(createId), generatorName: text("generatorName").notNull(), wasteType: text("wasteType").notNull(),
  quantityKg: doublePrecision("quantityKg").notNull(), destination: text("destination").notNull(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), notes: text("notes"),
  enterpriseId: text("enterpriseId").references(() => environmentalEnterprises.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalEducationPrograms = pgTable("EnvEduProgram", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), description: text("description").notNull(), targetAudience: text("targetAudience"),
  startDate: timestamp("startDate", { precision: 3 }).notNull(), endDate: timestamp("endDate", { precision: 3 }), participantsCount: integer("participantsCount"),
  status: text("status").notNull().default("Planejado"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const environmentalDocuments = pgTable("EnvDocument", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), docType: text("docType").notNull(), fileUrl: text("fileUrl"),
  enterpriseId: text("enterpriseId").references(() => environmentalEnterprises.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const issuedEnvironmentalLicenses = pgTable("EnvironmentalLicense", {
  id: text("id").primaryKey().$defaultFn(createId), numeroProcesso: text("numeroProcesso").notNull(), numeroLicenca: text("numeroLicenca").notNull(),
  tipoLicenca: text("tipoLicenca").notNull(), requerenteNome: text("requerenteNome").notNull(), requerenteCnpjCpf: text("requerenteCnpjCpf").notNull(),
  atividade: text("atividade").notNull(), enderecoEmpreendimento: text("enderecoEmpreendimento").notNull(), validadeData: timestamp("validadeData", { precision: 3 }).notNull(),
  status: text("status").notNull().default("EMITIDA"), hashSHA256: text("hashSHA256").notNull(), qrCodeValidationUrl: text("qrCodeValidationUrl").notNull(),
  emissaoData: timestamp("emissaoData", { precision: 3 }).notNull().defaultNow(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("EnvironmentalLicense_numeroProcesso_key").on(table.numeroProcesso), uniqueIndex("EnvironmentalLicense_numeroLicenca_key").on(table.numeroLicenca)]);
