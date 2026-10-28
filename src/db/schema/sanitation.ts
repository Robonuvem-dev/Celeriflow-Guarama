import { boolean, doublePrecision, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";

export const consumerUnits = pgTable("SanConsumerUnit", {
  id: text("id").primaryKey().$defaultFn(createId),
  code: text("code").notNull(),
  address: text("address").notNull(),
  streetAddress: text("streetAddress"),
  neighborhood: text("neighborhood"),
  postalCode: text("postalCode"),
  category: text("category").notNull().default("Residencial"),
  status: text("status").notNull().default("Ativa"),
  ownerName: text("ownerName"),
  ownerDocument: text("ownerDocument"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("SanConsumerUnit_code_key").on(table.code), index("SanConsumerUnit_createdAt_id_idx").on(table.createdAt, table.id)]);

export const waterMeters = pgTable("SanWaterMeter", {
  id: text("id").primaryKey().$defaultFn(createId),
  meterNumber: text("meterNumber").notNull(),
  installation: timestamp("installation", { precision: 3 }),
  status: text("status").notNull().default("Instalado"),
  unitId: text("unitId").notNull().references(() => consumerUnits.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("SanWaterMeter_meterNumber_key").on(table.meterNumber)]);

export const meterReadings = pgTable("SanMeterReading", {
  id: text("id").primaryKey().$defaultFn(createId),
  competence: text("competence").notNull(),
  previousValue: doublePrecision("previousValue").notNull(),
  currentValue: doublePrecision("currentValue").notNull(),
  consumption: doublePrecision("consumption").notNull(),
  readingDate: timestamp("readingDate", { precision: 3 }).notNull().defaultNow(),
  readerName: text("readerName"),
  status: text("status").notNull().default("Registrada"),
  unitId: text("unitId").notNull().references(() => consumerUnits.id, { onDelete: "cascade", onUpdate: "cascade" }),
  meterId: text("meterId").references(() => waterMeters.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("SanMeterReading_unitId_competence_key").on(table.unitId, table.competence), index("SanMeterReading_readingDate_id_idx").on(table.readingDate, table.id)]);

export const sanitationInvoices = pgTable("SanInvoice", {
  id: text("id").primaryKey().$defaultFn(createId),
  invoiceNumber: text("invoiceNumber").notNull(),
  competence: text("competence").notNull(),
  totalAmount: doublePrecision("totalAmount").notNull(),
  dueDate: timestamp("dueDate", { precision: 3 }).notNull(),
  status: text("status").notNull().default("Emitida"),
  unitId: text("unitId").notNull().references(() => consumerUnits.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("SanInvoice_invoiceNumber_key").on(table.invoiceNumber), index("SanInvoice_dueDate_id_idx").on(table.dueDate, table.id)]);

export const sanitationServiceOrders = pgTable("SanServiceOrder", {
  id: text("id").primaryKey().$defaultFn(createId),
  orderNumber: text("orderNumber").notNull(),
  orderType: text("orderType").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("Normal"),
  status: text("status").notNull().default("Aberta"),
  technician: text("technician"),
  unitId: text("unitId").references(() => consumerUnits.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("SanServiceOrder_orderNumber_key").on(table.orderNumber), index("SanServiceOrder_createdAt_id_idx").on(table.createdAt, table.id)]);

export const waterQualityAnalyses = pgTable("SanWaterQualityAnalysis", {
  id: text("id").primaryKey().$defaultFn(createId),
  collectionPoint: text("collectionPoint").notNull(),
  collectedAt: timestamp("collectedAt", { precision: 3 }).notNull(),
  parameter: text("parameter").notNull(),
  result: text("result").notNull(),
  limit: text("limit").notNull(),
  compliance: text("compliance").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("SanWaterQualityAnalysis_active_collectedAt_idx").on(table.active, table.collectedAt)]);

export const sanitationPortalRequests = pgTable("SanPortalRequest", {
  id: text("id").primaryKey().$defaultFn(createId),
  requestType: text("requestType").notNull(),
  requesterName: text("requesterName").notNull(),
  requestedAt: timestamp("requestedAt", { precision: 3 }).notNull().defaultNow(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("SanPortalRequest_active_requestedAt_idx").on(table.active, table.requestedAt)]);

export const sanitationSavedReports = pgTable("SanSavedReport", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  type: text("type").notNull(),
  period: text("period").notNull(),
  format: text("format").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const legacyWaterReadings = pgTable("WaterMeterReading", {
  id: text("id").primaryKey().$defaultFn(createId),
  codigoMatricula: text("codigoMatricula").notNull(),
  nomeConsumidor: text("nomeConsumidor").notNull(),
  endereco: text("endereco").notNull(),
  numeroHidrometro: text("numeroHidrometro").notNull(),
  leituraAnterior: doublePrecision("leituraAnterior").notNull(),
  leituraAtual: doublePrecision("leituraAtual").notNull(),
  consumoM3: doublePrecision("consumoM3").notNull(),
  valorFatura: exactNumeric("valorFatura", { precision: 18, scale: 2 }).notNull(),
  tipoTarifa: text("tipoTarifa").notNull().default("RESIDENCIAL"),
  dataLeitura: timestamp("dataLeitura", { precision: 3 }).notNull().defaultNow(),
  statusFatura: text("statusFatura").notNull().default("EMITIDA"),
  linhaDigitavel: text("linhaDigitavel"),
  qrCodePix: text("qrCodePix"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
