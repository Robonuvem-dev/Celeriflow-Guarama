import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";
import { bankStatementItems } from "./finance-banking";

export const reconciliationBankAccounts = pgTable("BankAccount", {
  id: text("id").primaryKey().$defaultFn(createId), bankName: text("bankName").notNull(), agency: text("agency").notNull(),
  bankId: text("bankId"), bankBranchId: text("bankBranchId"), accountNumber: text("accountNumber").notNull(),
  accountType: text("accountType").notNull().default("Movimento"), currentBalance: doublePrecision("currentBalance").notNull().default(0),
  currentBalanceDecimal: exactNumeric("currentBalanceDecimal", { precision: 18, scale: 2 }), resourceSourceId: text("resourceSourceId"),
  budgetUnitId: text("budgetUnitId"), accountingPlanId: text("accountingPlanId"), isActive: boolean("isActive").notNull().default(true),
  externalId: text("externalId"), purpose: text("purpose"), linkedInvestmentAccountId: text("linkedInvestmentAccountId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("BankAccount_accountingPlanId_key").on(table.accountingPlanId), uniqueIndex("BankAccount_externalId_key").on(table.externalId), index("BankAccount_bankId_idx").on(table.bankId), index("BankAccount_bankBranchId_idx").on(table.bankBranchId)]);

export const reconciliationTreasuryMovements = pgTable("TreasuryMovement", {
  id: text("id").primaryKey().$defaultFn(createId), date: timestamp("date", { precision: 3 }).notNull().defaultNow(),
  type: text("type").notNull(), direction: text("direction").notNull(), valueDecimal: exactNumeric("valueDecimal", { precision: 18, scale: 2 }).notNull(),
  history: text("history"), status: text("status").notNull().default("Confirmado"), bankAccountId: text("bankAccountId").notNull(),
  resourceSourceId: text("resourceSourceId"), financialYearId: text("financialYearId").notNull(), revenueId: text("revenueId"),
  sourceModule: text("sourceModule").notNull().default("MANUAL"), sourceType: text("sourceType").notNull().default("TREASURY_MOVEMENT"),
  sourceId: text("sourceId"), eventType: text("eventType").notNull().default("TREASURY_MOVEMENT"), idempotencyKey: text("idempotencyKey"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("TreasuryMovement_revenueId_key").on(table.revenueId), uniqueIndex("TreasuryMovement_idempotencyKey_key").on(table.idempotencyKey), index("TreasuryMovement_bankAccountId_date_idx").on(table.bankAccountId, table.date), index("TreasuryMovement_bankAccountId_resourceSourceId_date_idx").on(table.bankAccountId, table.resourceSourceId, table.date), index("TreasuryMovement_financialYearId_date_idx").on(table.financialYearId, table.date)]);

export const bankReconciliationSessions = pgTable("BankReconciliationSession", {
  id: text("id").primaryKey().$defaultFn(createId), bankAccountId: text("bankAccountId"), banco: text("banco").notNull(),
  agencia: text("agencia").notNull(), contaNumero: text("contaNumero").notNull(), periodo: text("periodo").notNull(),
  dataInicio: timestamp("dataInicio", { precision: 3 }).notNull(), dataFim: timestamp("dataFim", { precision: 3 }).notNull(),
  saldoInicialDecimal: exactNumeric("saldoInicialDecimal", { precision: 18, scale: 2 }).notNull(),
  totalDebitosDecimal: exactNumeric("totalDebitosDecimal", { precision: 18, scale: 2 }).notNull(),
  totalCreditosDecimal: exactNumeric("totalCreditosDecimal", { precision: 18, scale: 2 }).notNull(),
  saldoFinalDecimal: exactNumeric("saldoFinalDecimal", { precision: 18, scale: 2 }).notNull(),
  saldoRazaoDecimal: exactNumeric("saldoRazaoDecimal", { precision: 18, scale: 2 }).notNull(),
  diferencaDecimal: exactNumeric("diferencaDecimal", { precision: 18, scale: 2 }).notNull(),
  status: text("status").notNull().default("ABERTA"), totalItensBanco: integer("totalItensBanco").notNull().default(0),
  totalItensContabeis: integer("totalItensContabeis").notNull().default(0), itensConciliados: integer("itensConciliados").notNull().default(0),
  itensDivergentes: integer("itensDivergentes").notNull().default(0), confirmadoPor: text("confirmadoPor"),
  confirmadoEm: timestamp("confirmadoEm", { precision: 3 }), reciboIntegracao: text("reciboIntegracao"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("BankReconciliationSession_bankAccountId_periodo_key").on(table.bankAccountId, table.periodo), index("BankReconciliationSession_banco_agencia_contaNumero_periodo_idx").on(table.banco, table.agencia, table.contaNumero, table.periodo)]);

export const bankReconciliationAllocationGroups = pgTable("BankReconciliationAllocationGroup", {
  id: text("id").primaryKey().$defaultFn(createId), sessionId: text("sessionId").notNull().references(() => bankReconciliationSessions.id, { onDelete: "restrict", onUpdate: "cascade" }),
  bankAccountId: text("bankAccountId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), request: jsonb("request").$type<JsonValue>().notNull(),
  reason: text("reason").notNull(), status: text("status").notNull().default("EFETIVADO"), authorUsuarioId: text("authorUsuarioId").notNull(),
  reversedByUsuarioId: text("reversedByUsuarioId"), reversalReason: text("reversalReason"), reversedAt: timestamp("reversedAt", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("BankReconciliationAllocationGroup_idempotencyKey_key").on(table.idempotencyKey), index("BankReconciliationAllocationGroup_sessionId_status_idx").on(table.sessionId, table.status), index("BankReconciliationAllocationGroup_bankAccountId_status_idx").on(table.bankAccountId, table.status)]);

export const bankReconciliationAllocations = pgTable("BankReconciliationAllocation", {
  id: text("id").primaryKey().$defaultFn(createId), groupId: text("groupId").notNull().references(() => bankReconciliationAllocationGroups.id, { onDelete: "restrict", onUpdate: "cascade" }),
  statementItemId: text("statementItemId").notNull().references(() => bankStatementItems.id, { onDelete: "restrict", onUpdate: "cascade" }),
  treasuryMovementId: text("treasuryMovementId").notNull().references(() => reconciliationTreasuryMovements.id, { onDelete: "restrict", onUpdate: "cascade" }),
  amountDecimal: exactNumeric("amountDecimal", { precision: 18, scale: 2 }).notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("BankReconciliationAllocation_group_statement_movement_key").on(table.groupId, table.statementItemId, table.treasuryMovementId), index("BankReconciliationAllocation_statementItemId_idx").on(table.statementItemId), index("BankReconciliationAllocation_treasuryMovementId_idx").on(table.treasuryMovementId)]);

export const bankReconciliations = pgTable("BankReconciliation", {
  id: text("id").primaryKey().$defaultFn(createId), date: timestamp("date", { precision: 3 }).notNull().defaultNow(),
  periodStart: timestamp("periodStart", { precision: 3 }).notNull(), periodEnd: timestamp("periodEnd", { precision: 3 }).notNull(), bankAccountId: text("bankAccountId").notNull(),
  systemBalance: doublePrecision("systemBalance").notNull(), systemBalanceDecimal: exactNumeric("systemBalanceDecimal", { precision: 18, scale: 2 }),
  bankBalance: doublePrecision("bankBalance").notNull(), bankBalanceDecimal: exactNumeric("bankBalanceDecimal", { precision: 18, scale: 2 }),
  status: text("status").notNull().default("Pendente"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const bankReconciliationMatches = pgTable("BankReconciliationMatch", {
  id: text("id").primaryKey().$defaultFn(createId), sessionId: text("sessionId").notNull(), statementItemId: text("statementItemId"), treasuryMovementId: text("treasuryMovementId"),
  tipoMatch: text("tipoMatch").notNull(), percentualConfianca: doublePrecision("percentualConfianca").notNull().default(100), observacao: text("observacao"), status: text("status").notNull().default("AUTOMATICO"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("BankReconciliationMatch_sessionId_idx").on(table.sessionId)]);
