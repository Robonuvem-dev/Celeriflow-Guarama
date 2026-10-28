import { customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  fromDriver: value => new Uint8Array(value),
  toDriver: value => Buffer.from(value),
});

export const bankStatementImports = pgTable("BankStatementImport", {
  id: text("id").primaryKey().$defaultFn(createId),
  bankAccountId: text("bankAccountId").notNull(), format: text("format").notNull(),
  fileName: text("fileName"), checksum: text("checksum").notNull(),
  status: text("status").notNull().default("Importado"),
  importedAt: timestamp("importedAt", { precision: 3 }).notNull().defaultNow(),
  originalBytes: bytea("originalBytes"), originalEncoding: text("originalEncoding"),
  processingSnapshot: jsonb("processingSnapshot").$type<JsonValue>(),
}, table => [uniqueIndex("BankStatementImport_bankAccountId_checksum_key").on(table.bankAccountId, table.checksum)]);

export const bankStatementItems = pgTable("BankStatementItem", {
  id: text("id").primaryKey().$defaultFn(createId), bankAccountId: text("bankAccountId"),
  statementImportId: text("statementImportId").references(() => bankStatementImports.id, { onDelete: "set null", onUpdate: "cascade" }),
  date: timestamp("date", { precision: 3 }).notNull(), description: text("description"), reference: text("reference"),
  direction: text("direction").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(),
  status: text("status").notNull().default("Pendente"), treasuryMovementId: text("treasuryMovementId"),
  downloadId: text("downloadId"), banco: text("banco"), agencia: text("agencia"), contaNumero: text("contaNumero"),
  tipoConta: text("tipoConta"), codigoTransacao: text("codigoTransacao"), sinal: text("sinal"),
  saldoResultanteDecimal: exactNumeric("saldoResultanteDecimal", { precision: 18, scale: 2 }),
  categoriaClassificada: text("categoriaClassificada"), reciboMunicipal: text("reciboMunicipal"),
  lancamentoContabilId: text("lancamentoContabilId"), bankTransactionId: text("bankTransactionId"),
  integrationEventId: text("integrationEventId"), transactionType: text("transactionType"),
  clientReference: text("clientReference"), collectionReference: text("collectionReference"),
  reversalOfBankTransactionId: text("reversalOfBankTransactionId"),
}, table => [
  uniqueIndex("BankStatementItem_treasuryMovementId_key").on(table.treasuryMovementId),
  uniqueIndex("BankStatementItem_banco_agencia_contaNumero_codigoTransacao_key").on(table.banco, table.agencia, table.contaNumero, table.codigoTransacao),
  index("BankStatementItem_statementImportId_date_idx").on(table.statementImportId, table.date),
  index("BankStatementItem_treasuryMovementId_idx").on(table.treasuryMovementId),
  index("BankStatementItem_downloadId_idx").on(table.downloadId),
  index("BankStatementItem_contaNumero_date_idx").on(table.contaNumero, table.date),
  index("BankStatementItem_bankAccountId_bankTransactionId_idx").on(table.bankAccountId, table.bankTransactionId),
  index("BankStatementItem_integrationEventId_idx").on(table.integrationEventId),
]);

export const automatedBankDownloads = pgTable("AutomatedBankDownload", {
  id: text("id").primaryKey().$defaultFn(createId), banco: text("banco").notNull(), agencia: text("agencia").notNull(),
  contaNumero: text("contaNumero").notNull(), tipoConta: text("tipoConta").notNull(),
  periodoInicio: timestamp("periodoInicio", { precision: 3 }).notNull(), periodoFim: timestamp("periodoFim", { precision: 3 }).notNull(),
  nomeArquivo: text("nomeArquivo").notNull(), caminhoDestino: text("caminhoDestino").notNull(), formato: text("formato").notNull(),
  hashSHA256: text("hashSHA256").notNull(), tamanhoBytes: integer("tamanhoBytes").notNull(),
  status: text("status").notNull().default("CONCLUIDO"), logsExecucao: text("logsExecucao").notNull(),
  auditLogId: text("auditLogId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [
  uniqueIndex("AutomatedBankDownload_banco_agencia_contaNumero_hashSHA256_key").on(table.banco, table.agencia, table.contaNumero, table.hashSHA256),
  index("AutomatedBankDownload_banco_agencia_contaNumero_createdAt_idx").on(table.banco, table.agencia, table.contaNumero, table.createdAt),
]);
