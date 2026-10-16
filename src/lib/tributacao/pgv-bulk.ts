import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { fiscalCatalogSchema, publishFiscalCatalogInTransaction } from "./configurable-cadastres";

export const pgvBulkFilterSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), neighborhoodId: z.string().nullable(), streetId: z.string().nullable() });
const patchSchema = z.object({ name: fiscalCatalogSchema.shape.name, active: fiscalCatalogSchema.shape.active, fields: fiscalCatalogSchema.shape.fields, catalogValues: fiscalCatalogSchema.shape.catalogValues, neighborhoodId: fiscalCatalogSchema.shape.neighborhoodId, streetId: fiscalCatalogSchema.shape.streetId, landUnitValue: fiscalCatalogSchema.shape.landUnitValue }).partial().strict().refine(patch => Object.keys(patch).length > 0, "Informe ao menos uma alteração.");
const bulkSchema = z.object({ filter: pgvBulkFilterSchema, expected: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive() })).min(1).max(500), patch: patchSchema, legalBasis: z.string().trim().min(1).max(4000) });

export async function readPgvBulkSelection(db: PrismaClient | Prisma.TransactionClient, actor: TaxActor, raw: z.input<typeof pgvBulkFilterSchema>) {
  const filter = pgvBulkFilterSchema.parse(raw);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(filter.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await db.planningEntityUnit.findFirst({ where: { governmentEntityId: filter.governmentEntityId, budgetUnitId: filter.budgetUnitId } })) throw new Error("Ente/UG não conciliados.");
  const entries = await db.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", data: { path: ["budgetUnitId"], equals: filter.budgetUnitId } }, orderBy: { version: "desc" } });
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  return [...latest.values()].map(entry => ({ entry, data: fiscalCatalogSchema.parse(entry.data) })).filter(({ data }) => data.kind === "PGV" && data.governmentEntityId === filter.governmentEntityId && (!filter.neighborhoodId || data.neighborhoodId === filter.neighborhoodId) && (!filter.streetId || data.streetId === filter.streetId)).sort((a, b) => a.entry.entityId.localeCompare(b.entry.entityId));
}

export async function bulkChangePgvCatalogs(db: PrismaClient, actor: TaxActor, raw: z.input<typeof bulkSchema>) {
  const input = bulkSchema.parse(raw);
  if (new Set(input.expected.map(row => row.id)).size !== input.expected.length) throw new Error("PGVs repetidas na seleção.");
  return db.$transaction(async tx => {
    for (const row of [...input.expected].sort((a, b) => a.id.localeCompare(b.id))) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG_ID:${row.id}`},0))::text`;
    const selection = await readPgvBulkSelection(tx, actor, input.filter);
    if (selection.length !== input.expected.length || selection.some(({ entry }) => !input.expected.some(row => row.id === entry.entityId && row.version === entry.version))) throw new Error("A seleção ou versão das PGVs mudou. Refaça a prévia.");
    const updated = [];
    for (const { entry, data } of selection) updated.push(await publishFiscalCatalogInTransaction(tx, actor, { ...data, ...input.patch, ...(input.patch.catalogValues ? { catalogValues: { ...data.catalogValues, ...input.patch.catalogValues } } : {}), catalogId: entry.entityId, expectedVersion: entry.version, legalBasis: input.legalBasis }));
    await tx.taxAuditLog.create({ data: { action: "BULK_CHANGE_PGV", entityType: "FISCAL_CATALOG", entityId: input.filter.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { filter: input.filter, before: input.expected, after: updated.map(row => row.id), patch: input.patch, legalBasis: input.legalBasis } as Prisma.InputJsonValue } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
