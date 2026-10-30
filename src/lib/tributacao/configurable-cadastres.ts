import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import type { ConfiguredFiscalEntry } from "@/lib/contracts/tax-configured-records-operations";
import { changeConfiguredFiscalPropertyStatus, configuredFiscalNeighborhoodExists, configuredFiscalOriginExists, configuredFiscalProcessExists, configuredFiscalSnapshot, configuredFiscalStreetExists, insertConfiguredFiscalAudit, insertConfiguredFiscalEntry, listConfiguredFiscalActivities, listConfiguredFiscalCatalogCode, lockConfiguredFiscalKey, lockConfiguredFiscalSubject, readLatestConfiguredFiscalEntry, readValidConfiguredFiscalDocuments } from "@/db/repositories/tax-configured-records-operations/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { attributePropertyHistory, touchPropertyMetadata } from "./property-history";
import { updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";
import { enforceEconomicProfileDebtPolicy } from "./economic-debt-policy";
import { linkItbiPropertyAttachments } from "./itbi-attachments";

import { fiscalCatalogKinds, fiscalCatalogEntityType } from "./fiscal-catalog-kinds";
import { fiscalFieldSchema } from "./fiscal-field-definition";
export { fiscalFieldSchema } from "./fiscal-field-definition";
export const fiscalCatalogSchema = z.object({
  catalogId: z.string().optional(), expectedVersion: z.number().int().nonnegative(), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1),
  kind: z.enum(fiscalCatalogKinds), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(240), active: z.boolean(),
  fields: z.array(fiscalFieldSchema).max(100), neighborhoodId: z.string().nullable(), streetId: z.string().nullable(),
  catalogValues: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])).optional(),
  landUnitValue: z.string().nullable(), legalBasis: z.string().trim().min(1).max(4000),
  validatePartnerDebt: z.boolean().default(false),
  zoningActivities: z.array(z.object({ cnae: z.string().regex(/^\d{7}$/, "CNAE exige sete dígitos."), treatment: z.enum(["PERMITIDA", "PERMISSIVEL", "PROIBIDA"]), condition: z.string().trim().max(2000) }).strict()).max(200).optional(),
  provisionalValidityDays:z.number().int().min(1).max(3650).nullable().optional(),validateCompanyDebt:z.boolean().optional(),validateCompanyPartnerDebts:z.boolean().optional(),
}).refine(value => new Set(value.fields.map(field => field.key)).size === value.fields.length, "As chaves dos campos devem ser distintas.")
  .refine(value => value.fields.every(field => !["active", "process", "documents", "frontage"].includes(field.key)), "As chaves active, process, documents e frontage são reservadas à operação.")
  .refine(value => !value.zoningActivities?.length || value.kind === "ZONEAMENTO", "Atividades urbanísticas exigem catálogo de zoneamento.")
  .refine(value => new Set(value.zoningActivities?.map(row => row.cnae)).size === (value.zoningActivities?.length ?? 0), "Informe um único tratamento por CNAE no zoneamento.");
export const fiscalRecordSchema = z.object({ catalogId: z.string().min(1), entityType: z.enum(["REAL_ESTATE", "ECONOMIC_REGISTRATION", "ITBI_DECLARATION"]), entityId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), active: z.boolean(), values: z.record(z.string(), z.unknown()), processId: z.string().nullable(), documentIds: z.array(z.string().min(1)).max(50), frontage: z.string().nullable(), occurrenceId: z.uuid().optional() });

export function validateFiscalFields(fields: z.infer<typeof fiscalFieldSchema>[], values: Record<string, unknown>, previousValues: Record<string, unknown> = {}, configureDefaults = false) {
  const result: Record<string, string | boolean | null> = {};
  const keys = new Set(fields.map(field => field.key));
  if (Object.keys(values).some(key => !keys.has(key))) throw new Error("O formulário contém campos não configurados.");
  for (const field of fields) {
    const locked = field.visible === false || field.enabled === false;
    const value = locked && !configureDefaults ? previousValues[field.key] : values[field.key];
    if (value === undefined || value === null || value === "") { if (field.required && (!locked || configureDefaults)) throw new Error(`${field.label} é obrigatório.`); result[field.key] = null; continue; }
    if (field.type === "BOOLEAN") { if (typeof value !== "boolean") throw new Error(`${field.label} deve ser verdadeiro ou falso.`); result[field.key] = value; }
    else {
      if (typeof value !== "string" || value.length > (field.maxLength ?? 4000)) throw new Error(`${field.label} inválido.`);
      if (!value.trim()) { if (field.required) throw new Error(`${field.label} é obrigatório.`); result[field.key] = null; continue; }
      if (field.type === "NUMBER") { let parsed: Decimal; try { parsed = new Decimal(value); } catch { throw new Error(`${field.label} deve ser numérico.`); } if (!parsed.isFinite()) throw new Error(`${field.label} deve ser finito.`); if (field.numberType === "INTEGER" && !parsed.isInteger()) throw new Error(`${field.label} deve ser inteiro.`); if (field.numberType === "CURRENCY" && parsed.decimalPlaces() > 2) throw new Error(`${field.label} deve ter até duas casas decimais.`); result[field.key] = parsed.toString(); }
      else if (field.type === "DATE") { const date = new Date(`${value}T12:00:00.000Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${field.label} deve ser uma data válida.`); result[field.key] = value; }
      else if (field.type === "LIST") { if (!field.options.includes(value)) throw new Error(`${field.label} não pertence à lista configurada.`); result[field.key] = value; }
      else result[field.key] = value.trim();
    }
  }
  return result;
}

async function authorize(tx: DatabaseExecutor, actor: TaxActor, governmentEntityId: string, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await configuredFiscalOriginExists(tx, governmentEntityId, budgetUnitId)) throw new Error("UG não pertence ao ente selecionado.");
}

export async function publishFiscalCatalog(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof fiscalCatalogSchema>): Promise<ConfiguredFiscalEntry> {
  return withDatabaseTransaction(db, tx => publishFiscalCatalogInTransaction(tx, actor, raw), { timeoutMs: 5000 });
}

export async function publishFiscalCatalogInTransaction(tx: DatabaseTransaction, actor: TaxActor, raw: z.input<typeof fiscalCatalogSchema>): Promise<ConfiguredFiscalEntry> {
  const input = fiscalCatalogSchema.parse(raw);
  if (input.catalogValues !== undefined) input.catalogValues = validateFiscalFields(input.fields, input.catalogValues, {}, true);
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    if (input.kind === "ZONEAMENTO") await lockConfiguredFiscalKey(tx, `ECONOMIC_ACTIVITY:${input.budgetUnitId}`);
    const id = input.catalogId ?? randomUUID();
    if (input.catalogId) await lockConfiguredFiscalKey(tx, `FISCAL_CATALOG_ID:${id}`);
    await lockConfiguredFiscalKey(tx, `FISCAL_CATALOG:${input.budgetUnitId}:${input.kind}:${input.code}`);
    const previous = await readLatestConfiguredFiscalEntry(tx, "FISCAL_CATALOG", id, "TYPED_FISCAL_CATALOG");
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O catálogo foi alterado. Recarregue antes de publicar.");
    if (previous) { const data = taxScopeSnapshot(previous.data); if (data.budgetUnitId !== input.budgetUnitId || data.governmentEntityId !== input.governmentEntityId || data.kind !== input.kind || data.code !== input.code) throw new Error("Origem, tipo e código são imutáveis; crie outro catálogo."); }
    const codeEntries = await listConfiguredFiscalCatalogCode(tx, input.code);
    if (codeEntries.some(entry => entry.entityId !== id && taxScopeSnapshot(entry.data).kind === input.kind && taxScopeSnapshot(entry.data).budgetUnitId === input.budgetUnitId)) throw new Error("Já existe esse código no catálogo da UG.");
    if (input.neighborhoodId && !await configuredFiscalNeighborhoodExists(tx, input.neighborhoodId)) throw new Error("Bairro não encontrado.");
    if (input.streetId && !await configuredFiscalStreetExists(tx, input.streetId)) throw new Error("Logradouro não encontrado.");
    const zoningActivitySnapshots: { cnae: string; activityId: string; definitionId: string; version: number; name: string }[] = [];
    if (input.zoningActivities?.length) {
      const definitions = await listConfiguredFiscalActivities(tx, input.governmentEntityId, input.budgetUnitId);
      const latest = new Map<string, typeof definitions[number]>(); for (const definition of definitions) if (!latest.has(definition.entityId)) latest.set(definition.entityId, definition);
      for (const rule of input.zoningActivities) {
        const matching = [...latest.values()].filter(definition => { const data = taxScopeSnapshot(definition.data); return data.cnae === rule.cnae && data.active === true; });
        if (matching.length !== 1) throw new Error(`O CNAE ${rule.cnae} exige uma atividade ativa e inequívoca na mesma origem municipal.`);
        const definition = matching[0]; const data = taxScopeSnapshot(definition.data);
        zoningActivitySnapshots.push({ cnae: rule.cnae, activityId: definition.entityId, definitionId: definition.id, version: definition.version, name: String(data.name) });
      }
    }
    if (input.kind === "PGV") {
      if (!input.neighborhoodId || !input.streetId || input.landUnitValue === null) throw new Error("A PGV exige bairro, logradouro e valor do m².");
      const value = new Decimal(input.landUnitValue);
      if (!value.isFinite() || value.lt(0)) throw new Error("Valor do m² inválido.");
    }
    const entry = await insertConfiguredFiscalEntry(tx, { entityType: "FISCAL_CATALOG", entityId: id, category: "TYPED_FISCAL_CATALOG", title: input.name, version: input.expectedVersion + 1, status: input.active ? "ATIVO" : "INATIVO", actorUsuarioId: actor.usuarioId, data: configuredFiscalSnapshot({ ...input, catalogId: id, ...(input.kind === "ZONEAMENTO" ? { zoningActivitySnapshots } : {}) }) });
    await insertConfiguredFiscalAudit(tx, { action: "PUBLISH_FISCAL_CATALOG", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, catalogId: id, version: entry.version, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId } });
    return entry;
}

export async function saveConfiguredFiscalRecord(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof fiscalRecordSchema>): Promise<ConfiguredFiscalEntry> {
  return withDatabaseTransaction(db, tx => saveConfiguredFiscalRecordInTransaction(tx, actor, raw), { timeoutMs: 5000 });
}

export async function saveConfiguredFiscalRecordInTransaction(tx: DatabaseTransaction, actor: TaxActor, raw: z.input<typeof fiscalRecordSchema>): Promise<ConfiguredFiscalEntry> {
  const input = fiscalRecordSchema.parse(raw);
    await lockConfiguredFiscalKey(tx, `FISCAL_CATALOG_ID:${input.catalogId}`);
    const definition = await readLatestConfiguredFiscalEntry(tx, "FISCAL_CATALOG", input.catalogId, "TYPED_FISCAL_CATALOG");
    if (!definition) throw new Error("Catálogo fiscal não encontrado.");
    const catalog = fiscalCatalogSchema.parse(definition.data);
    await authorize(tx, actor, catalog.governmentEntityId, catalog.budgetUnitId);
    if (!catalog.active) throw new Error("Catálogo desativado.");
    if (input.entityType !== fiscalCatalogEntityType(catalog.kind)) throw new Error("O catálogo não se aplica ao tipo de cadastro selecionado.");
    const subjectSnapshot = await lockConfiguredFiscalSubject(tx, input.entityType, input.entityId);
    if (input.entityType === "ITBI_DECLARATION") {
      const scope = taxScopeSnapshot(subjectSnapshot);
      if (scope.budgetUnitId !== catalog.budgetUnitId || scope.governmentEntityId !== catalog.governmentEntityId) throw new Error("Declaração de outro ente/UG.");
    }
    if (input.processId && !await configuredFiscalProcessExists(tx, input.processId)) throw new Error("Protocolo não encontrado.");
    const documents = await readValidConfiguredFiscalDocuments(tx, input.documentIds);
    if (documents.length !== new Set(input.documentIds).size) throw new Error("Selecione documentos válidos no GED.");
    if (catalog.kind === "PGV" && input.active) {
      if (!input.frontage?.trim()) throw new Error("Identifique a testada do terreno.");
      const frontage = new Decimal(input.frontage);
      if (!frontage.isFinite() || frontage.lte(0)) throw new Error("Testada deve ser positiva.");
    }
    const inspection = ["TIPO_VISTORIA_IMOVEL", "TIPO_VISTORIA_EMPRESA"].includes(catalog.kind);
    if (inspection && !input.occurrenceId) throw new Error("Identifique a ocorrência da vistoria.");
    if (!inspection && input.occurrenceId) throw new Error("Ocorrências independentes se aplicam às vistorias.");
    const recordKey = inspection ? `${input.catalogId}:${input.occurrenceId}` : input.catalogId;
    const previous = await readLatestConfiguredFiscalEntry(tx, input.entityType, input.entityId, "TYPED_FISCAL_RECORD", recordKey);
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O formulário foi alterado. Recarregue antes de salvar.");
    const values = validateFiscalFields(catalog.fields, input.values, { ...(catalog.catalogValues ?? {}), ...taxScopeSnapshot(taxScopeSnapshot(previous?.data).values) });
    if (input.entityType === "ECONOMIC_REGISTRATION" && catalog.kind !== "SITUACAO_EMPRESA") await enforceEconomicProfileDebtPolicy(tx, actor, input.entityId);
    if (input.entityType === "REAL_ESTATE") {
      const profile = await readLatestConfiguredFiscalEntry(tx, input.entityType, input.entityId, "PROPERTY_PROFILE");
      const data = taxScopeSnapshot(profile?.data);
      if (profile && (data.governmentEntityId !== catalog.governmentEntityId || data.budgetUnitId !== catalog.budgetUnitId)) throw new Error("Catálogo de outro ente/UG em relação ao imóvel conciliado.");
      const bulletinKinds: Partial<Record<typeof catalog.kind, string>> = { BCI_TERRENO: "Terreno", BCI_UNIDADE: "Unidade", BCI_RURAL: "Rural" };
      const expectedKind = bulletinKinds[catalog.kind];
      if (expectedKind && data.kind !== expectedKind) throw new Error("O boletim deve corresponder ao tipo conciliado do imóvel.");
      if (catalog.kind !== "SITUACAO_IMOVEL" || !input.active) await touchPropertyMetadata(tx, actor.usuarioId, input.entityId, input.processId);
    }
    if (input.active && catalog.kind === "SITUACAO_IMOVEL") {
      await attributePropertyHistory(tx, actor.usuarioId);
      await changeConfiguredFiscalPropertyStatus(tx, input.entityId, catalog.name, input.processId);
    }
    if (input.active && catalog.kind === "SITUACAO_EMPRESA") {
      await updateEconomicRegistrationWithHistoryInTransaction(tx, actor, input.entityId, { status: catalog.name });
    }
    const entry = await insertConfiguredFiscalEntry(tx, { entityType: input.entityType, entityId: input.entityId, category: "TYPED_FISCAL_RECORD", title: recordKey, version: input.expectedVersion + 1, status: input.active ? "ATIVO" : "INATIVO", actorUsuarioId: actor.usuarioId, processId: input.processId, documentId: input.documentIds[0] ?? null, data: configuredFiscalSnapshot({ ...catalog, catalogId: input.catalogId, occurrenceId: input.occurrenceId ?? null, catalogVersion: definition.version, definitionId: definition.id, values, frontage: input.frontage, documentIds: input.documentIds, previousId: previous?.id ?? null }) });
    await insertConfiguredFiscalAudit(tx, { action: "SAVE_CONFIGURED_FISCAL_RECORD", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { beforeId: previous?.id ?? null, afterId: entry.id, entityId: input.entityId, entityType: input.entityType, catalogId: input.catalogId, fields: values } });
    if (input.entityType === "ITBI_DECLARATION") await linkItbiPropertyAttachments(tx, actor, input.entityId, input.documentIds);
    return entry;
}
