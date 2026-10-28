import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";
import { users } from "./identity";
import { employees } from "./administration";

export const taxAuditLogs = pgTable("TaxAuditLog", {
  id: text("id").primaryKey().$defaultFn(createId),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  payload: jsonb("payload").$type<JsonValue>(),
  authorUsuarioId: text("authorUsuarioId").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
  authorEmployeeId: text("authorEmployeeId").references(() => employees.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("TaxAuditLog_entityType_entityId_idx").on(table.entityType, table.entityId)]);

export const taxAuditCrossChecks = pgTable("TaxAuditCrossCheck", {
  id: text("id").primaryKey().$defaultFn(createId),
  cnpjCpfContribuinte: text("cnpjCpfContribuinte").notNull(),
  razaoSocial: text("razaoSocial").notNull(),
  origemCruzamento: text("origemCruzamento").notNull(),
  valorDeclarado: exactNumeric("valorDeclarado", { precision: 18, scale: 2 }).notNull(),
  valorApuradoBancos: exactNumeric("valorApuradoBancos", { precision: 18, scale: 2 }).notNull(),
  divergenciaImposto: exactNumeric("divergenciaImposto", { precision: 18, scale: 2 }).notNull(),
  statusMalha: text("statusMalha").notNull().default("MALHA_FINA"),
  numeroAutoInfracao: text("numeroAutoInfracao"),
  dataCruzamento: timestamp("dataCruzamento", { precision: 3 }).notNull().defaultNow(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
