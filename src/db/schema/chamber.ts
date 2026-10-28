import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const timestamps = () => ({
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const legislatures = pgTable("CamLegislatura", {
  id: text("id").primaryKey().$defaultFn(createId), numero: integer("numero").notNull(),
  inicio: timestamp("inicio", { precision: 3 }).notNull(), fim: timestamp("fim", { precision: 3 }).notNull(),
  status: text("status").notNull().default("Ativa"), descricao: text("descricao"), secretariatId: text("secretariatId"), ...timestamps(),
});
export const councilors = pgTable("CamVereador", {
  id: text("id").primaryKey().$defaultFn(createId), nomeCompleto: text("nomeCompleto").notNull(), nomeParlamentar: text("nomeParlamentar").notNull(),
  cpf: text("cpf"), partido: text("partido"), email: text("email"), telefone: text("telefone"), foto: text("foto"),
  status: text("status").notNull().default("Em ExercÃ­cio"), active: boolean("active").notNull().default(true),
  personId: text("personId"), employeeId: text("employeeId"), legislaturaId: text("legislaturaId").notNull(), ...timestamps(),
});
export const sessions = pgTable("CamSessao", {
  id: text("id").primaryKey().$defaultFn(createId), numero: integer("numero").notNull(), tipo: text("tipo").notNull().default("OrdinÃ¡ria"),
  data: timestamp("data", { precision: 3 }).notNull(), local: text("local").notNull().default("PlenÃ¡rio"), status: text("status").notNull().default("Agendada"),
  quorum: integer("quorum"), legislaturaId: text("legislaturaId"), ...timestamps(),
});
export const propositions = pgTable("CamProposicao", {
  id: text("id").primaryKey().$defaultFn(createId), numero: text("numero").notNull(), tipo: text("tipo").notNull(), ementa: text("ementa").notNull(), texto: text("texto"),
  status: text("status").notNull().default("Protocolada"), dataProtocolo: timestamp("dataProtocolo", { precision: 3 }).notNull().defaultNow(),
  urgente: boolean("urgente").notNull().default(false), autorId: text("autorId").notNull(), sessaoId: text("sessaoId"), ...timestamps(),
});
export const committees = pgTable("CamComissao", {
  id: text("id").primaryKey().$defaultFn(createId), nome: text("nome").notNull(), sigla: text("sigla"), tipo: text("tipo").notNull().default("Permanente"), descricao: text("descricao"),
  status: text("status").notNull().default("Ativa"), legislaturaId: text("legislaturaId").notNull(), ...timestamps(),
});
export const committeeMembers = pgTable("CamComissaoMembro", {
  id: text("id").primaryKey().$defaultFn(createId), cargo: text("cargo").notNull().default("Membro"), status: text("status").notNull().default("Ativo"),
  comissaoId: text("comissaoId").notNull(), vereadorId: text("vereadorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const boardPositions = pgTable("CamMesaDiretora", {
  id: text("id").primaryKey().$defaultFn(createId), cargo: text("cargo").notNull(), status: text("status").notNull().default("Ativo"),
  legislaturaId: text("legislaturaId").notNull(), vereadorId: text("vereadorId").notNull(), ...timestamps(),
});
export const cabinets = pgTable("CamGabinete", {
  id: text("id").primaryKey().$defaultFn(createId), sala: text("sala").notNull(), andar: text("andar"), telefone: text("telefone"), ramal: text("ramal"),
  status: text("status").notNull().default("Ativo"), vereadorId: text("vereadorId").notNull(), ...timestamps(),
});
export const minutes = pgTable("CamAta", {
  id: text("id").primaryKey().$defaultFn(createId), numero: text("numero").notNull(), conteudo: text("conteudo").notNull(), status: text("status").notNull().default("Rascunho"),
  dataAprovacao: timestamp("dataAprovacao", { precision: 3 }), sessaoId: text("sessaoId").notNull(), ...timestamps(),
});
export const laws = pgTable("CamLei", {
  id: text("id").primaryKey().$defaultFn(createId), numero: text("numero").notNull(), tipo: text("tipo").notNull(), ementa: text("ementa").notNull(), texto: text("texto"),
  dataPublicacao: timestamp("dataPublicacao", { precision: 3 }), dataVigor: timestamp("dataVigor", { precision: 3 }), status: text("status").notNull().default("Vigente"),
  legalTextId: text("legalTextId"), proposicaoId: text("proposicaoId"), ...timestamps(),
});
export const hearings = pgTable("CamAudiencia", {
  id: text("id").primaryKey().$defaultFn(createId), tema: text("tema").notNull(), descricao: text("descricao"), data: timestamp("data", { precision: 3 }).notNull(),
  local: text("local").notNull(), tipo: text("tipo").notNull().default("PÃºblica"), status: text("status").notNull().default("Agendada"), ata: text("ata"),
  sessaoId: text("sessaoId"), legislaturaId: text("legislaturaId"), ...timestamps(),
});
