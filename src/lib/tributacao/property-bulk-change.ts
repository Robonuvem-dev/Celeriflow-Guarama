import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { attributePropertyHistory } from "./property-history";
import { propertyProfileSchema } from "./property-profile-schema";
import { savePropertyProfileInTransaction } from "./property-profile";
import { fiscalCatalogSchema, saveConfiguredFiscalRecordInTransaction } from "./configurable-cadastres";

type Db = PrismaClient | Prisma.TransactionClient;
export const propertyBulkFilterSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), streetId: z.string().nullable(), neighborhoodId: z.string().nullable(), kind: z.enum(["Terreno", "Unidade", "Rural"]).nullable(), status: z.string().max(120), propertyUse: z.string().max(120), fieldFilter: z.object({ catalogId: z.string().min(1), key: z.string().min(1), value: z.union([z.string(), z.boolean(), z.null()]) }).nullable() });
const nativePatchSchema = z.object({ registration: z.string().max(120), streetName: z.string().trim().min(1).max(240), streetId: z.string().nullable(), neighborhoodId: z.string().nullable(), number: z.string().max(40), complement: z.string().max(240), lot: z.string().max(80), block: z.string().max(80), landArea: z.number().finite().nonnegative(), builtArea: z.number().finite().nonnegative(), propertyUse: z.string().trim().min(1).max(120), fiscalZone: z.string().max(120), status: z.string().trim().min(1).max(120) }).partial().strict();
const profilePatchSchema = z.object({ ...propertyProfileSchema.shape }).omit({ propertyId: true, expectedVersion: true, expectedUpdatedAt: true, governmentEntityId: true, budgetUnitId: true, documentIds: true, processId: true, reason: true }).partial().strict();
const changeSchema = z.object({ filter: propertyBulkFilterSchema, expectedFingerprint: z.string().length(64), native: nativePatchSchema, profile: profilePatchSchema, form: z.object({ catalogId: z.string().min(1), expectedCatalogVersion: z.number().int().positive(), values: z.record(z.string(), z.unknown()) }).nullable(), processId: z.string().nullable(), reason: z.string().trim().min(1).max(4000) }).refine(input => Object.keys(input.native).length + Object.keys(input.profile).length > 0 || input.form !== null, "Informe uma alteração.");

export async function readPropertyBulkSelection(db: Db, actor: TaxActor, raw: z.input<typeof propertyBulkFilterSchema>) {
  const filter = propertyBulkFilterSchema.parse(raw);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(filter.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await db.planningEntityUnit.findFirst({ where: { governmentEntityId: filter.governmentEntityId, budgetUnitId: filter.budgetUnitId } })) throw new Error("Ente/UG não conciliados.");
  const profiles = await db.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", category: "PROPERTY_PROFILE", data: { path: ["budgetUnitId"], equals: filter.budgetUnitId } }, orderBy: { version: "desc" } });
  const latest = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  const ids = [...latest.values()].filter(row => { const data = taxScopeSnapshot(row.data); return data.governmentEntityId === filter.governmentEntityId && (!filter.kind || data.kind === filter.kind); }).map(row => row.entityId);
  let properties = await db.realEstate.findMany({ where: { id: { in: ids }, ...(filter.streetId ? { streetId: filter.streetId } : {}), ...(filter.neighborhoodId ? { neighborhoodId: filter.neighborhoodId } : {}), ...(filter.status ? { status: filter.status } : {}), ...(filter.propertyUse ? { propertyUse: filter.propertyUse } : {}) }, orderBy: { id: "asc" } });
  const records = await db.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", entityId: { in: properties.map(row => row.id) }, category: "TYPED_FISCAL_RECORD" }, orderBy: { version: "desc" } });
  const latestRecords = new Map<string, typeof records[number]>(); for (const row of records) if (!latestRecords.has(`${row.entityId}:${row.title}`)) latestRecords.set(`${row.entityId}:${row.title}`, row);
  if (filter.fieldFilter) { const criterion = filter.fieldFilter; properties = properties.filter(row => { const record = latestRecords.get(`${row.id}:${criterion.catalogId}`); return record?.status === "ATIVO" && taxScopeSnapshot(taxScopeSnapshot(record.data).values)[criterion.key] === criterion.value; }); }
  const selection = properties.map(property => ({ property, profile: latest.get(property.id)!, records: [...latestRecords.values()].filter(row => row.entityId === property.id).sort((a, b) => a.title.localeCompare(b.title)) }));
  const fingerprint = createHash("sha256").update(JSON.stringify(selection.map(row => ({ id: row.property.id, updatedAt: row.property.updatedAt.toISOString(), profileId: row.profile.id, records: row.records.map(record => record.id) })))).digest("hex");
  return { selection, fingerprint };
}

export async function bulkChangeProperties(db: PrismaClient, actor: TaxActor, raw: z.input<typeof changeSchema>) {
  const input = changeSchema.parse(raw);
  return db.$transaction(async tx => {
    if (Object.keys(input.profile).length) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PROPERTY_REGISTRATION_POLICY:${input.filter.budgetUnitId}`},0))::text`;
    // Catalog locks precede property locks, matching the ordinary typed-form editor.
    if (input.form) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG_ID:${input.form.catalogId}`},0))::text`;
    const initial = await readPropertyBulkSelection(tx, actor, input.filter);
    if (!initial.selection.length || initial.selection.length > 500) throw new Error("Selecione entre 1 e 500 imóveis; refine os filtros.");
    for (const row of initial.selection) await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${row.property.id} FOR UPDATE`;
    const selected = await readPropertyBulkSelection(tx, actor, input.filter);
    if (selected.fingerprint !== input.expectedFingerprint) throw new Error("A seleção ou os cadastros foram alterados. Refaça a prévia.");
    if (input.processId && !await tx.process.findUnique({ where: { id: input.processId } })) throw new Error("Protocolo não encontrado.");
    if (input.native.streetId && !await tx.street.findUnique({ where: { id: input.native.streetId } })) throw new Error("Logradouro não encontrado.");
    if (input.native.neighborhoodId && !await tx.neighborhood.findUnique({ where: { id: input.native.neighborhoodId } })) throw new Error("Bairro não encontrado.");
    if (input.native.status && !["Ativo", "Inativo", "Baixado", "Suspenso", "Construído"].includes(input.native.status)) {
      const definitions = await tx.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", AND: [{ data: { path: ["governmentEntityId"], equals: input.filter.governmentEntityId } }, { data: { path: ["budgetUnitId"], equals: input.filter.budgetUnitId } }, { data: { path: ["kind"], equals: "SITUACAO_IMOVEL" } }] }, orderBy: { version: "desc" } });
      const latest = new Map<string, typeof definitions[number]>(); for (const definition of definitions) if (!latest.has(definition.entityId)) latest.set(definition.entityId, definition);
      if (![...latest.values()].some(definition => { const config = fiscalCatalogSchema.parse(definition.data); return config.active && config.name === input.native.status; })) throw new Error("Selecione uma situação imobiliária ativa da mesma origem municipal.");
    }
    let catalog: z.infer<typeof fiscalCatalogSchema> | null = null;
    if (input.form) {
      const definition = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "FISCAL_CATALOG", entityId: input.form.catalogId, category: "TYPED_FISCAL_CATALOG" }, orderBy: { version: "desc" } });
      catalog = fiscalCatalogSchema.parse(definition.data);
      if (definition.version !== input.form.expectedCatalogVersion || !["BCI_TERRENO", "BCI_UNIDADE", "BCI_RURAL"].includes(catalog.kind)) throw new Error("Boletim alterado ou incompatível. Refaça a prévia.");
    }
    await attributePropertyHistory(tx, actor.usuarioId);
    await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process',${input.processId ?? ""},true), set_config('celeriflow.cadastral_profile_change','true',true)`;
    const changed: string[] = [];
    for (const row of selected.selection) {
      if (Object.keys(input.profile).length) {
        const profile = propertyProfileSchema.parse(row.profile.data);
        await savePropertyProfileInTransaction(tx, actor, { ...profile, ...input.profile, expectedVersion: row.profile.version, expectedUpdatedAt: row.property.updatedAt.toISOString(), processId: input.processId, reason: input.reason });
      }
      if (Object.keys(input.native).length) await tx.realEstate.update({ where: { id: row.property.id }, data: input.native });
      if (input.form && catalog) {
        const record = row.records.find(record => record.title === input.form!.catalogId);
        await saveConfiguredFiscalRecordInTransaction(tx, actor, { catalogId: input.form.catalogId, entityType: "REAL_ESTATE", entityId: row.property.id, expectedVersion: record?.version ?? 0, active: true, values: { ...taxScopeSnapshot(taxScopeSnapshot(record?.data).values), ...input.form.values }, processId: input.processId, documentIds: [], frontage: null });
      }
      changed.push(row.property.id);
    }
    await tx.taxAuditLog.create({ data: { action: "BULK_CHANGE_PROPERTIES", entityType: "BUDGET_UNIT", entityId: input.filter.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: JSON.parse(JSON.stringify({ ...input, propertyIds: changed })) } });
    return { changed: changed.length, propertyIds: changed };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 });
}
