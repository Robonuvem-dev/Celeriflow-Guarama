import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const systemInstances = pgTable("ConfiguracaoInstancia", {
  id: text("id").primaryKey().$defaultFn(createId),
  nomePrefeitura: text("nomePrefeitura").notNull(),
  cnpj: text("cnpj"),
  municipio: text("municipio").notNull(),
  uf: text("uf").notNull(),
  dominio: text("dominio"),
  status: text("status").notNull().default("Ativa"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const instanceParameters = pgTable("ConfiguracaoParametroInstancia", {
  id: text("id").primaryKey().$defaultFn(createId),
  configuracaoInstanciaId: text("configuracaoInstanciaId").notNull().references(() => systemInstances.id, { onDelete: "cascade", onUpdate: "cascade" }),
  chave: text("chave").notNull(),
  valor: jsonb("valor").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("ConfiguracaoParametroInstancia_configuracaoInstanciaId_chave_key").on(table.configuracaoInstanciaId, table.chave), index("ConfiguracaoParametroInstancia_configuracaoInstanciaId_idx").on(table.configuracaoInstanciaId)]);
