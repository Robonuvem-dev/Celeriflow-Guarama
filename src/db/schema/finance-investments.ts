import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
export const yieldTransactions = pgTable("YieldTransaction", {
  id: text("id").primaryKey().$defaultFn(createId), statementItemId: text("statementItemId"), contaNumero: text("contaNumero").notNull(), data: timestamp("data", { precision: 3 }).notNull(),
  valorBrutoDecimal: money("valorBrutoDecimal").notNull(), irrfDecimal: money("irrfDecimal").notNull().default(sql`0`), iofDecimal: money("iofDecimal").notNull().default(sql`0`), correcaoDecimal: money("correcaoDecimal").notNull().default(sql`0`), valorLiquidoDecimal: money("valorLiquidoDecimal").notNull(), saldoAcumuladoDecimal: money("saldoAcumuladoDecimal"),
  tipoRendimento: text("tipoRendimento").notNull(), reciboMunicipal: text("reciboMunicipal"), lancamentoContabilId: text("lancamentoContabilId"), idempotencyKey: text("idempotencyKey"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("YieldTransaction_idempotencyKey_key").on(t.idempotencyKey)]);
export const investmentAllocations = pgTable("InvestmentAllocation", {
  id: text("id").primaryKey().$defaultFn(createId), originBankAccountId: text("originBankAccountId").notNull(), investmentBankAccountId: text("investmentBankAccountId").notNull(), treasuryTransferId: text("treasuryTransferId"), valueDecimal: money("valueDecimal").notNull(), status: text("status").notNull().default("ATIVA"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("InvestmentAllocation_treasuryTransferId_key").on(t.treasuryTransferId)]);
