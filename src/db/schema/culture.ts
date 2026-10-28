import { boolean, doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
export const culturalAgents = pgTable("CulturaAgente", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), tipo: text("tipo").notNull(), segmento: text("segmento").notNull(), cpfCnpj: text("cpfCnpj"), telefone: text("telefone"), email: text("email"),
  status: text("status").notNull().default("Ativo"), active: boolean("active").notNull().default(true), personId: text("personId"), companyId: text("companyId"), ...timestamps(),
});
export const culturalSpaces = pgTable("CulturaEspaco", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), tipo: text("tipo").notNull(), endereco: text("endereco"), capacidade: integer("capacidade"), status: text("status").notNull().default("DisponÃ­vel"),
  active: boolean("active").notNull().default(true), assetId: text("assetId"), realEstateId: text("realEstateId"), responsibleEmployeeId: text("responsibleEmployeeId"), ...timestamps(),
});
export const culturalEvents = pgTable("CulturaEvento", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), tipo: text("tipo").notNull(), data: timestamp("data", { precision: 3 }).notNull(), local: text("local"), publicoAlvo: text("publicoAlvo"),
  status: text("status").notNull().default("Programado"), active: boolean("active").notNull().default(true), startsAt: timestamp("startsAt", { precision: 3 }), endsAt: timestamp("endsAt", { precision: 3 }),
  spaceId: text("spaceId"), responsibleEmployeeId: text("responsibleEmployeeId"), projectId: text("projectId"), ...timestamps(),
});
export const culturalProjects = pgTable("CulturaProjeto", {
  id: text("id").primaryKey().$defaultFn(createId), numero: text("numero").notNull(), nome: text("nome").notNull(), descricao: text("descricao"), categoria: text("categoria").notNull(), status: text("status").notNull().default("Em AnÃ¡lise"),
  active: boolean("active").notNull().default(true), valorSolicitado: doublePrecision("valorSolicitado"), agenteId: text("agenteId").notNull(), appropriationId: text("appropriationId"), commitmentId: text("commitmentId"), purchaseProcessId: text("purchaseProcessId"), contractId: text("contractId"), ...timestamps(),
});
export const culturalActivities = pgTable("CulturaAtividade", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), modalidade: text("modalidade").notNull(), publicoAlvo: text("publicoAlvo"), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }),
  status: text("status").notNull().default("Ativa"), active: boolean("active").notNull().default(true), spaceId: text("spaceId"), instructorEmployeeId: text("instructorEmployeeId"), agentId: text("agentId"), ...timestamps(),
});
export const culturalReservations = pgTable("CulturaReserva", {
  id: text("id").primaryKey().$defaultFn(createId), startsAt: timestamp("startsAt", { precision: 3 }).notNull(), endsAt: timestamp("endsAt", { precision: 3 }).notNull(), purpose: text("purpose").notNull(), status: text("status").notNull().default("Solicitada"),
  active: boolean("active").notNull().default(true), notes: text("notes"), spaceId: text("spaceId").notNull(), personId: text("personId"), companyId: text("companyId"), eventId: text("eventId"), ...timestamps(),
});
export const culturalHeritages = pgTable("CulturaPatrimonio", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), tipo: text("tipo").notNull(), relevanciaCultural: text("relevanciaCultural"), situacaoProtecao: text("situacaoProtecao"), estadoConservacao: text("estadoConservacao"),
  status: text("status").notNull().default("Ativo"), active: boolean("active").notNull().default(true), assetId: text("assetId"), realEstateId: text("realEstateId"), ...timestamps(),
});
export const culturalCouncils = pgTable("CulturaConselho", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), tipo: text("tipo").notNull(), status: text("status").notNull().default("Ativo"), active: boolean("active").notNull().default(true), responsavel: text("responsavel"), ...timestamps(),
});
export const culturalFunds = pgTable("CulturaFundo", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), status: text("status").notNull().default("Ativo"), active: boolean("active").notNull().default(true), descricao: text("descricao"), appropriationId: text("appropriationId"), ...timestamps(),
});
export const culturalIncentiveProjects = pgTable("CulturalIncentiveProject", {
  id: text("id").primaryKey().$defaultFn(createId), codigoEdital: text("codigoEdital").notNull(), nomeEdital: text("nomeEdital").notNull(), tituloProjeto: text("tituloProjeto").notNull(), proponenteNome: text("proponenteNome").notNull(), proponenteCpfCnpj: text("proponenteCpfCnpj").notNull(), categoriaCultural: text("categoriaCultural").notNull(),
  valorSolicitado: exactNumeric("valorSolicitado", { precision: 18, scale: 2 }).notNull(), valorAprovado: exactNumeric("valorAprovado", { precision: 18, scale: 2 }).notNull(), status: text("status").notNull().default("EM_ANALISE"), prestacaoContasStatus: text("prestacaoContasStatus").notNull().default("PENDENTE"), reciboPrestacaoContas: text("reciboPrestacaoContas"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
