import { boolean, doublePrecision, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";

const timestamps = () => ({
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const securityGuards = pgTable("SegurancaGuarda", {
  id: text("id").primaryKey().$defaultFn(createId), matricula: text("matricula").notNull(), nome: text("nome").notNull(), tipo: text("tipo").notNull(),
  equipe: text("equipe"), status: text("status").notNull().default("Ativo"), isActive: boolean("isActive").notNull().default(true), employeeId: text("employeeId"), ...timestamps(),
});
export const securityOccurrences = pgTable("SegurancaOcorrencia", {
  id: text("id").primaryKey().$defaultFn(createId), numero: text("numero").notNull(), tipo: text("tipo").notNull(), descricao: text("descricao").notNull(),
  local: text("local"), bairro: text("bairro"), prioridade: text("prioridade").notNull().default("Normal"), status: text("status").notNull().default("Registrada"),
  isActive: boolean("isActive").notNull().default(true), responsavelGuardaId: text("responsavelGuardaId"), ...timestamps(),
});
export const securityInfractions = pgTable("SegurancaInfracao", {
  id: text("id").primaryKey().$defaultFn(createId), auto: text("auto").notNull(), data: timestamp("data", { precision: 3 }).notNull(), placa: text("placa").notNull(),
  tipo: text("tipo").notNull(), local: text("local").notNull(), valor: doublePrecision("valor"), status: text("status").notNull().default("Registrado"),
  isActive: boolean("isActive").notNull().default(true), ...timestamps(),
});
export const mobilityRecords = pgTable("SegurancaMobilidadeRegistro", {
  id: text("id").primaryKey().$defaultFn(createId), codigo: text("codigo").notNull(), categoria: text("categoria").notNull(), tipo: text("tipo").notNull(), titulo: text("titulo").notNull(),
  descricao: text("descricao"), local: text("local"), bairro: text("bairro"), responsavel: text("responsavel"), prioridade: text("prioridade").notNull().default("Normal"),
  status: text("status").notNull().default("Ativo"), dataInicio: timestamp("dataInicio", { precision: 3 }).notNull().defaultNow(), dataFim: timestamp("dataFim", { precision: 3 }),
  valor: doublePrecision("valor"), placa: text("placa"), relatedModule: text("relatedModule"), relatedId: text("relatedId"), assetId: text("assetId"), obrasServicoId: text("obrasServicoId"),
  documentId: text("documentId"), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
});
export const trafficTickets = pgTable("TrafficInfractionTicket", {
  id: text("id").primaryKey().$defaultFn(createId), numeroAit: text("numeroAit").notNull(), placaVeiculo: text("placaVeiculo").notNull(), chassi: text("chassi"),
  codigoCtb: text("codigoCtb").notNull(), descricaoInfracao: text("descricaoInfracao").notNull(), valorMulta: exactNumeric("valorMulta", { precision: 18, scale: 2 }).notNull(),
  geolocalizacao: text("geolocalizacao").notNull(), agenteMatricula: text("agenteMatricula").notNull(), status: text("status").notNull().default("AUTUADO"), qrCodePix: text("qrCodePix"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
