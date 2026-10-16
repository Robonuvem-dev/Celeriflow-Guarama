import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { attributePropertyHistory, touchPropertyMetadata } from "./property-history";
import { updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";
import { enforceEconomicProfileDebtPolicy } from "./economic-debt-policy";
import { linkItbiPropertyAttachments } from "./itbi-attachments";

import { fiscalCatalogKinds, fiscalCatalogEntityType } from "./fiscal-catalog-kinds";
export const fiscalFieldSchema = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/), label: z.string().trim().min(1).max(120), type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "LIST"]), required: z.boolean(), options: z.array(z.string().trim().min(1).max(120)).max(100).default([]) }).refine(field => field.type !== "LIST" || field.options.length > 0, "Campo de lista exige opções.");
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

export function validateFiscalFields(fields: z.infer<typeof fiscalFieldSchema>[], values: Record<string, unknown>) {
  const result: Record<string, string | boolean | null> = {};
  const keys = new Set(fields.map(field => field.key));
  if (Object.keys(values).some(key => !keys.has(key))) throw new Error("O formulário contém campos não configurados.");
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === null || value === "") { if (field.required) throw new Error(`${field.label} é obrigatório.`); result[field.key] = null; continue; }
    if (field.type === "BOOLEAN") { if (typeof value !== "boolean") throw new Error(`${field.label} deve ser verdadeiro ou falso.`); result[field.key] = value; }
    else {
      if (typeof value !== "string" || value.length > 4000) throw new Error(`${field.label} inválido.`);
      if (!value.trim()) { if (field.required) throw new Error(`${field.label} é obrigatório.`); result[field.key] = null; continue; }
      if (field.type === "NUMBER") { let parsed: Prisma.Decimal; try { parsed = new Prisma.Decimal(value); } catch { throw new Error(`${field.label} deve ser numérico.`); } if (!parsed.isFinite()) throw new Error(`${field.label} deve ser finito.`); result[field.key] = parsed.toString(); }
      else if (field.type === "DATE") { const date = new Date(`${value}T12:00:00.000Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${field.label} deve ser uma data válida.`); result[field.key] = value; }
      else if (field.type === "LIST") { if (!field.options.includes(value)) throw new Error(`${field.label} não pertence à lista configurada.`); result[field.key] = value; }
      else result[field.key] = value.trim();
    }
  }
  return result;
}

async function authorize(tx: Prisma.TransactionClient, actor: TaxActor, governmentEntityId: string, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await tx.planningEntityUnit.findFirst({ where: { governmentEntityId, budgetUnitId } })) throw new Error("UG não pertence ao ente selecionado.");
}

export async function publishFiscalCatalog(db: PrismaClient, actor: TaxActor, raw: z.input<typeof fiscalCatalogSchema>) {
  return db.$transaction(tx => publishFiscalCatalogInTransaction(tx, actor, raw));
}

export async function publishFiscalCatalogInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, raw: z.input<typeof fiscalCatalogSchema>) {
  const input = fiscalCatalogSchema.parse(raw);
  if (input.catalogValues !== undefined) input.catalogValues = validateFiscalFields(input.fields, input.catalogValues);
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    if (input.kind === "ZONEAMENTO") await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ECONOMIC_ACTIVITY:${input.budgetUnitId}`},0))::text`;
    const id = input.catalogId ?? randomUUID();
    if (input.catalogId) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG_ID:${id}`},0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG:${input.budgetUnitId}:${input.kind}:${input.code}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "FISCAL_CATALOG", entityId: id, category: "TYPED_FISCAL_CATALOG" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O catálogo foi alterado. Recarregue antes de publicar.");
    if (previous) { const data = taxScopeSnapshot(previous.data); if (data.budgetUnitId !== input.budgetUnitId || data.governmentEntityId !== input.governmentEntityId || data.kind !== input.kind || data.code !== input.code) throw new Error("Origem, tipo e código são imutáveis; crie outro catálogo."); }
    const codeEntries = await tx.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", data: { path: ["code"], equals: input.code } } });
    if (codeEntries.some(entry => entry.entityId !== id && taxScopeSnapshot(entry.data).kind === input.kind && taxScopeSnapshot(entry.data).budgetUnitId === input.budgetUnitId)) throw new Error("Já existe esse código no catálogo da UG.");
    if (input.neighborhoodId && !await tx.neighborhood.findUnique({ where: { id: input.neighborhoodId } })) throw new Error("Bairro não encontrado.");
    if (input.streetId && !await tx.street.findUnique({ where: { id: input.streetId } })) throw new Error("Logradouro não encontrado.");
    const zoningActivitySnapshots: { cnae: string; activityId: string; definitionId: string; version: number; name: string }[] = [];
    if (input.zoningActivities?.length) {
      const definitions = await tx.taxRegistryEntry.findMany({ where: { entityType: "ECONOMIC_ACTIVITY", category: "ECONOMIC_ACTIVITY_DEFINITION", AND: [{ data: { path: ["governmentEntityId"], equals: input.governmentEntityId } }, { data: { path: ["budgetUnitId"], equals: input.budgetUnitId } }] }, orderBy: { version: "desc" } });
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
      const value = new Prisma.Decimal(input.landUnitValue);
      if (!value.isFinite() || value.lt(0)) throw new Error("Valor do m² inválido.");
    }
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "FISCAL_CATALOG", entityId: id, category: "TYPED_FISCAL_CATALOG", title: input.name, version: input.expectedVersion + 1, status: input.active ? "ATIVO" : "INATIVO", actorUsuarioId: actor.usuarioId, data: JSON.parse(JSON.stringify({ ...input, catalogId: id, ...(input.kind === "ZONEAMENTO" ? { zoningActivitySnapshots } : {}) })) } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_FISCAL_CATALOG", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, catalogId: id, version: entry.version, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId } } });
    return entry;
}

export async function saveConfiguredFiscalRecord(db: PrismaClient, actor: TaxActor, raw: z.input<typeof fiscalRecordSchema>) {
  return db.$transaction(tx => saveConfiguredFiscalRecordInTransaction(tx, actor, raw));
}

export async function saveConfiguredFiscalRecordInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, raw: z.input<typeof fiscalRecordSchema>) {
  const input = fiscalRecordSchema.parse(raw);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG_ID:${input.catalogId}`},0))::text`;
    const definition = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "FISCAL_CATALOG", entityId: input.catalogId, category: "TYPED_FISCAL_CATALOG" }, orderBy: { version: "desc" } });
    const catalog = fiscalCatalogSchema.parse(definition.data);
    await authorize(tx, actor, catalog.governmentEntityId, catalog.budgetUnitId);
    if (!catalog.active) throw new Error("Catálogo desativado.");
    if (input.entityType !== fiscalCatalogEntityType(catalog.kind)) throw new Error("O catálogo não se aplica ao tipo de cadastro selecionado.");
    if (input.entityType === "REAL_ESTATE") { await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.entityId} FOR UPDATE`; await tx.realEstate.findUniqueOrThrow({ where: { id: input.entityId } }); }
    if (input.entityType === "ECONOMIC_REGISTRATION") { await tx.$queryRaw`SELECT id FROM "EconomicRegistration" WHERE id=${input.entityId} FOR UPDATE`; await tx.economicRegistration.findUniqueOrThrow({ where: { id: input.entityId } }); }
    if (input.entityType === "ITBI_DECLARATION") {
      await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.entityId} FOR UPDATE`;
      const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: input.entityId } });
      const scope = taxScopeSnapshot(declaration.calculationSnapshot);
      if (scope.budgetUnitId !== catalog.budgetUnitId || scope.governmentEntityId !== catalog.governmentEntityId) throw new Error("Declaração de outro ente/UG.");
    }
    if (input.processId && !await tx.process.findUnique({ where: { id: input.processId } })) throw new Error("Protocolo não encontrado.");
    const documents = await tx.document.findMany({ where: { id: { in: input.documentIds }, status: "Válido" }, select: { id: true } });
    if (documents.length !== new Set(input.documentIds).size) throw new Error("Selecione documentos válidos no GED.");
    if (catalog.kind === "PGV" && input.active) {
      if (!input.frontage?.trim()) throw new Error("Identifique a testada do terreno.");
      const frontage = new Prisma.Decimal(input.frontage);
      if (!frontage.isFinite() || frontage.lte(0)) throw new Error("Testada deve ser positiva.");
    }
    const inspection = ["TIPO_VISTORIA_IMOVEL", "TIPO_VISTORIA_EMPRESA"].includes(catalog.kind);
    if (inspection && !input.occurrenceId) throw new Error("Identifique a ocorrência da vistoria.");
    if (!inspection && input.occurrenceId) throw new Error("Ocorrências independentes se aplicam às vistorias.");
    const recordKey = inspection ? `${input.catalogId}:${input.occurrenceId}` : input.catalogId;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, category: "TYPED_FISCAL_RECORD", title: recordKey }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O formulário foi alterado. Recarregue antes de salvar.");
    const values = validateFiscalFields(catalog.fields, input.values);
    if (input.entityType === "ECONOMIC_REGISTRATION" && catalog.kind !== "SITUACAO_EMPRESA") await enforceEconomicProfileDebtPolicy(tx, actor, input.entityId);
    if (input.entityType === "REAL_ESTATE") {
      const profile = await tx.taxRegistryEntry.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
      const data = taxScopeSnapshot(profile?.data);
      if (profile && (data.governmentEntityId !== catalog.governmentEntityId || data.budgetUnitId !== catalog.budgetUnitId)) throw new Error("Catálogo de outro ente/UG em relação ao imóvel conciliado.");
      const expectedKind = ({ BCI_TERRENO: "Terreno", BCI_UNIDADE: "Unidade", BCI_RURAL: "Rural" } as Record<string, string>)[catalog.kind];
      if (expectedKind && data.kind !== expectedKind) throw new Error("O boletim deve corresponder ao tipo conciliado do imóvel.");
      if (catalog.kind !== "SITUACAO_IMOVEL" || !input.active) await touchPropertyMetadata(tx, actor.usuarioId, input.entityId, input.processId);
    }
    if (input.active && catalog.kind === "SITUACAO_IMOVEL") {
      await attributePropertyHistory(tx, actor.usuarioId);
      await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process', ${input.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`;
      await tx.realEstate.update({ where: { id: input.entityId }, data: { status: catalog.name } });
    }
    if (input.active && catalog.kind === "SITUACAO_EMPRESA") {
      await updateEconomicRegistrationWithHistoryInTransaction(tx, actor, input.entityId, { status: catalog.name });
    }
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: input.entityType, entityId: input.entityId, category: "TYPED_FISCAL_RECORD", title: recordKey, version: input.expectedVersion + 1, status: input.active ? "ATIVO" : "INATIVO", actorUsuarioId: actor.usuarioId, processId: input.processId, documentId: input.documentIds[0] ?? null, data: { ...catalog, catalogId: input.catalogId, occurrenceId: input.occurrenceId ?? null, catalogVersion: definition.version, definitionId: definition.id, values, frontage: input.frontage, documentIds: input.documentIds, previousId: previous?.id ?? null } as Prisma.InputJsonValue } });
    await tx.taxAuditLog.create({ data: { action: "SAVE_CONFIGURED_FISCAL_RECORD", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { beforeId: previous?.id ?? null, afterId: entry.id, entityId: input.entityId, entityType: input.entityType, catalogId: input.catalogId, fields: values } } });
    if (input.entityType === "ITBI_DECLARATION") await linkItbiPropertyAttachments(tx, actor, input.entityId, input.documentIds);
    return entry;
}
