import { boolean, doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";

export const bankClassificationRules = pgTable("ClassificationRule", {
  id: text("id").primaryKey().$defaultFn(createId), bancoCodigo: text("bancoCodigo"), textoProcurado: text("textoProcurado").notNull(),
  codigoTransacao: text("codigoTransacao"), sinalEsperado: text("sinalEsperado"), tipoMovimento: text("tipoMovimento").notNull(),
  bancoContaFiltro: text("bancoContaFiltro"), bankAccountId: text("bankAccountId"), tipoReceita: text("tipoReceita"),
  naturezaReceita: text("naturezaReceita"), fonteRecurso: text("fonteRecurso"), eventoContabil: text("eventoContabil"),
  deducaoAplicavel: boolean("deducaoAplicavel").notNull().default(false), prioridade: integer("prioridade").notNull().default(10),
  exigeConfirmacao: boolean("exigeConfirmacao").notNull().default(false), ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [index("ClassificationRule_ativo_prioridade_idx").on(table.ativo, table.prioridade), index("ClassificationRule_bankAccountId_idx").on(table.bankAccountId)]);

export const bankExceptionQueueItems = pgTable("ExceptionQueueItem", {
  id: text("id").primaryKey().$defaultFn(createId), statementItemId: text("statementItemId"), descricao: text("descricao").notNull(),
  valorDecimal: exactNumeric("valorDecimal", { precision: 18, scale: 2 }).notNull(), dataMovimento: timestamp("dataMovimento", { precision: 3 }).notNull(),
  banco: text("banco").notNull(), contaNumero: text("contaNumero").notNull(), sinal: text("sinal").notNull(), scoreConfianca: doublePrecision("scoreConfianca").notNull().default(0),
  sugestaoTipo: text("sugestaoTipo"), motivoExcecao: text("motivoExcecao").notNull(), status: text("status").notNull().default("PENDENTE"),
  resolvidoPor: text("resolvidoPor"), resolvidoEm: timestamp("resolvidoEm", { precision: 3 }), regraGeradaId: text("regraGeradaId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("ExceptionQueueItem_status_createdAt_idx").on(table.status, table.createdAt)]);
