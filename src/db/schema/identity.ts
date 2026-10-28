import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

// Physical names/types/defaults checked against the production catalog. These
// runtime mappings are not yet a complete migration schema; SQL remains authoritative.
export const accessProfiles = pgTable("ConfiguracaoPerfil", {
  id: text("id").primaryKey().$defaultFn(createId),
  codigo: text("codigo").notNull(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  permissoes: text("permissoes").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("ConfiguracaoPerfil_codigo_key").on(table.codigo)]);

export const users = pgTable("Usuario", {
  id: text("id").primaryKey().$defaultFn(createId),
  nome: text("nome").notNull(),
  email: text("email").notNull(),
  senha: text("senha").notNull().default("LEGACY_CREDENTIAL_DISABLED"),
  firebaseUid: text("firebaseUid"),
  ativo: boolean("ativo").notNull().default(true),
  perfilId: text("perfilId").notNull().references(() => accessProfiles.id, { onDelete: "restrict", onUpdate: "cascade" }),
  employeeId: text("employeeId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [
  uniqueIndex("Usuario_email_key").on(table.email),
  uniqueIndex("Usuario_firebaseUid_key").on(table.firebaseUid),
  uniqueIndex("Usuario_employeeId_key").on(table.employeeId),
]);

export const modules = pgTable("ConfiguracaoModulo", {
  id: text("id").primaryKey().$defaultFn(createId),
  nome: text("nome").notNull(),
  codigo: text("codigo").notNull(),
  ativo: boolean("ativo").notNull().default(false),
  dataAtivacao: timestamp("dataAtivacao", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("ConfiguracaoModulo_codigo_key").on(table.codigo)]);

export const userModulePermissions = pgTable("UsuarioModulo", {
  id: text("id").primaryKey().$defaultFn(createId),
  usuarioId: text("usuarioId").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  moduloId: text("moduloId").notNull().references(() => modules.id, { onDelete: "restrict", onUpdate: "cascade" }),
  canView: boolean("canView").notNull().default(false),
  canEdit: boolean("canEdit").notNull().default(false),
}, table => [uniqueIndex("UsuarioModulo_usuarioId_moduloId_key").on(table.usuarioId, table.moduloId)]);

export const userBudgetUnits = pgTable("UsuarioUnidadeGestora", {
  id: text("id").primaryKey().$defaultFn(createId),
  usuarioId: text("usuarioId").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  budgetUnitId: text("budgetUnitId").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("UsuarioUnidadeGestora_usuarioId_budgetUnitId_key").on(table.usuarioId, table.budgetUnitId)]);
