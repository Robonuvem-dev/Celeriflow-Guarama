import { boolean, doublePrecision, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { departments, employees } from "./administration";
import { assets } from "./assets";
import { materials, materialStocks } from "./assets-stock";
import { documents } from "./registry";

const timestamps = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()) });
const assignmentDates = () => ({ assignedAt: timestamp("assignedAt", { precision: 3 }).notNull().defaultNow(), releasedAt: timestamp("releasedAt", { precision: 3 }) });

export const infrastructureWorks = pgTable("ObrasObra", {
  id: text("id").primaryKey().$defaultFn(createId), numero: text("numero").notNull(), nome: text("nome").notNull(), descricao: text("descricao"), local: text("local"), tipo: text("tipo").notNull(), valorEstimado: doublePrecision("valorEstimado"), status: text("status").notNull().default("Em Planejamento"), active: boolean("active").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("ObrasObra_numero_key").on(t.numero)]);

export const infrastructureMeasurements = pgTable("ObrasMedicao", {
  id: text("id").primaryKey().$defaultFn(createId), numero: integer("numero").notNull(), data: timestamp("data", { precision: 3 }).notNull(), valorMedido: doublePrecision("valorMedido").notNull(), status: text("status").notNull().default("Em Análise"), active: boolean("active").notNull().default(true), obraId: text("obraId").notNull().references(() => infrastructureWorks.id, { onDelete: "cascade", onUpdate: "cascade" }), ...timestamps(),
}, t => [uniqueIndex("ObrasMedicao_obraId_numero_key").on(t.obraId, t.numero)]);

export const infrastructureServices = pgTable("ObrasServico", {
  id: text("id").primaryKey().$defaultFn(createId), protocolo: text("protocolo").notNull(), tipo: text("tipo").notNull(), descricao: text("descricao").notNull(), local: text("local").notNull(), status: text("status").notNull().default("Aberto"), active: boolean("active").notNull().default(true), scheduledFor: timestamp("scheduledFor", { precision: 3 }), completedAt: timestamp("completedAt", { precision: 3 }), estimatedCost: doublePrecision("estimatedCost"),
  departmentId: text("departmentId").references(() => departments.id, { onDelete: "set null", onUpdate: "cascade" }), targetAssetId: text("targetAssetId").references(() => assets.id, { onDelete: "set null", onUpdate: "cascade" }), budgetAppropriationId: text("budgetAppropriationId"), commitmentId: text("commitmentId"), ...timestamps(),
}, t => [uniqueIndex("ObrasServico_protocolo_key").on(t.protocolo)]);

export const infrastructureTeams = pgTable("ObrasEquipe", {
  id: text("id").primaryKey().$defaultFn(createId), code: text("code").notNull(), name: text("name").notNull(), isActive: boolean("isActive").notNull().default(true), departmentId: text("departmentId").references(() => departments.id, { onDelete: "set null", onUpdate: "cascade" }), ...timestamps(),
}, t => [uniqueIndex("ObrasEquipe_code_key").on(t.code)]);

export const infrastructureTeamMembers = pgTable("ObrasEquipeMembro", {
  id: text("id").primaryKey().$defaultFn(createId), equipeId: text("equipeId").notNull().references(() => infrastructureTeams.id, { onDelete: "cascade", onUpdate: "cascade" }), employeeId: text("employeeId").notNull().references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), isLeader: boolean("isLeader").notNull().default(false), isActive: boolean("isActive").notNull().default(true), ...timestamps(),
}, t => [uniqueIndex("ObrasEquipeMembro_equipeId_employeeId_key").on(t.equipeId, t.employeeId)]);

export const infrastructureServiceEmployees = pgTable("ObrasServicoEmployee", {
  id: text("id").primaryKey().$defaultFn(createId), obrasServicoId: text("obrasServicoId").notNull().references(() => infrastructureServices.id, { onDelete: "cascade", onUpdate: "cascade" }), employeeId: text("employeeId").notNull().references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), role: text("role").notNull().default("Executor"), ...assignmentDates(),
}, t => [uniqueIndex("ObrasServicoEmployee_obrasServicoId_employeeId_key").on(t.obrasServicoId, t.employeeId)]);

export const infrastructureServiceTeams = pgTable("ObrasServicoEquipe", {
  id: text("id").primaryKey().$defaultFn(createId), obrasServicoId: text("obrasServicoId").notNull().references(() => infrastructureServices.id, { onDelete: "cascade", onUpdate: "cascade" }), equipeId: text("equipeId").notNull().references(() => infrastructureTeams.id, { onDelete: "restrict", onUpdate: "cascade" }), ...assignmentDates(),
}, t => [uniqueIndex("ObrasServicoEquipe_obrasServicoId_equipeId_key").on(t.obrasServicoId, t.equipeId)]);

export const infrastructureServiceEquipment = pgTable("ObrasServicoEquipamento", {
  id: text("id").primaryKey().$defaultFn(createId), obrasServicoId: text("obrasServicoId").notNull().references(() => infrastructureServices.id, { onDelete: "cascade", onUpdate: "cascade" }), assetId: text("assetId").notNull().references(() => assets.id, { onDelete: "restrict", onUpdate: "cascade" }), operatingHours: doublePrecision("operatingHours"), ...assignmentDates(),
}, t => [uniqueIndex("ObrasServicoEquipamento_obrasServicoId_assetId_key").on(t.obrasServicoId, t.assetId)]);

export const infrastructureServiceMaterials = pgTable("ObrasServicoMaterial", {
  id: text("id").primaryKey().$defaultFn(createId), obrasServicoId: text("obrasServicoId").notNull().references(() => infrastructureServices.id, { onDelete: "cascade", onUpdate: "cascade" }), materialId: text("materialId").notNull().references(() => materials.id, { onDelete: "restrict", onUpdate: "cascade" }), stockId: text("stockId").references(() => materialStocks.id, { onDelete: "set null", onUpdate: "cascade" }), quantityPlanned: doublePrecision("quantityPlanned").notNull().default(0), quantityIssued: doublePrecision("quantityIssued").notNull().default(0), unitCost: doublePrecision("unitCost"), ...timestamps(),
}, t => [uniqueIndex("ObrasServicoMaterial_obrasServicoId_materialId_key").on(t.obrasServicoId, t.materialId)]);

export const infrastructureServiceDocuments = pgTable("ObrasServicoDocumento", {
  id: text("id").primaryKey().$defaultFn(createId), obrasServicoId: text("obrasServicoId").notNull().references(() => infrastructureServices.id, { onDelete: "cascade", onUpdate: "cascade" }), documentId: text("documentId").notNull().references(() => documents.id, { onDelete: "cascade", onUpdate: "cascade" }), purpose: text("purpose").notNull().default("Comprovante"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ObrasServicoDocumento_obrasServicoId_documentId_key").on(t.obrasServicoId, t.documentId)]);

export const infrastructureServicePurchases = pgTable("ObrasServicoCompra", {
  id: text("id").primaryKey().$defaultFn(createId), obrasServicoId: text("obrasServicoId").notNull().references(() => infrastructureServices.id, { onDelete: "cascade", onUpdate: "cascade" }), purchaseRequestId: text("purchaseRequestId"), purchaseProcessId: text("purchaseProcessId"), purpose: text("purpose").notNull().default("Material"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("ObrasServicoCompra_obrasServicoId_purchaseRequestId_key").on(t.obrasServicoId, t.purchaseRequestId), uniqueIndex("ObrasServicoCompra_obrasServicoId_purchaseProcessId_key").on(t.obrasServicoId, t.purchaseProcessId)]);
