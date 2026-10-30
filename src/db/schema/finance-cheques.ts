import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import { reconciliationBankAccounts } from "./finance-reconciliation";
import { users } from "./identity";

export const financeCheckbooks = pgTable("FinanceCheckbook", {
  id: text("id").primaryKey().$defaultFn(createId), bankAccountId: text("bankAccountId").notNull().references(() => reconciliationBankAccounts.id),
  label: text("label").notNull(), firstNumber: integer("firstNumber").notNull(), lastNumber: integer("lastNumber").notNull(),
  createdByUsuarioId: text("createdByUsuarioId").notNull().references(() => users.id), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [index("FinanceCheckbook_bank_idx").on(t.bankAccountId)]);
export const financeCheques = pgTable("FinanceCheque", {
  id: text("id").primaryKey().$defaultFn(createId), checkbookId: text("checkbookId").notNull().references(() => financeCheckbooks.id),
  bankAccountId: text("bankAccountId").notNull().references(() => reconciliationBankAccounts.id), number: integer("number").notNull(),
  payee: text("payee").notNull(), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), issuedAt: timestamp("issuedAt", { precision: 3 }).notNull(),
  status: text("status").notNull().default("EMITIDO"), clearedAt: timestamp("clearedAt", { precision: 3 }), cancellationReason: text("cancellationReason"),
  createdByUsuarioId: text("createdByUsuarioId").notNull().references(() => users.id), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("FinanceCheque_account_number_key").on(t.bankAccountId, t.number), index("FinanceCheque_status_date_idx").on(t.status, t.issuedAt)]);
