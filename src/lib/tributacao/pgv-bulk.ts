import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { appendPropertyAudit, listPropertyCatalogs, lockPropertyKey, propertyOriginExists } from "@/db/repositories/tax-property/records";
import { propertySnapshot } from "@/db/repositories/tax-property/snapshot";
import type { PropertyRegistryRecord } from "@/db/repositories/tax-property/contracts";
import { z } from "zod";
import type { TaxActor } from "./index";
import { fiscalCatalogSchema, publishFiscalCatalogInTransaction } from "./configurable-cadastres";

export const pgvBulkFilterSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), neighborhoodId: z.string().nullable(), streetId: z.string().nullable() });
const patchSchema = z.object({ name: fiscalCatalogSchema.shape.name, active: fiscalCatalogSchema.shape.active, fields: fiscalCatalogSchema.shape.fields, catalogValues: fiscalCatalogSchema.shape.catalogValues, neighborhoodId: fiscalCatalogSchema.shape.neighborhoodId, streetId: fiscalCatalogSchema.shape.streetId, landUnitValue: fiscalCatalogSchema.shape.landUnitValue }).partial().strict().refine(patch => Object.keys(patch).length > 0, "Informe ao menos uma alteração.");
const bulkSchema = z.object({ filter: pgvBulkFilterSchema, expected: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive() })).min(1).max(500), patch: patchSchema, legalBasis: z.string().trim().min(1).max(4000) });

export async function readPgvBulkSelection(db: DatabaseExecutor, actor: TaxActor, raw: z.input<typeof pgvBulkFilterSchema>) {
  const filter = pgvBulkFilterSchema.parse(raw);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(filter.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await propertyOriginExists(db, filter.governmentEntityId, filter.budgetUnitId)) throw new Error("Ente/UG não conciliados.");
  const entries = await listPropertyCatalogs(db, filter.budgetUnitId);
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  return [...latest.values()].map(entry => ({ entry, data: fiscalCatalogSchema.parse(entry.data) })).filter(({ data }) => data.kind === "PGV" && data.governmentEntityId === filter.governmentEntityId && (!filter.neighborhoodId || data.neighborhoodId === filter.neighborhoodId) && (!filter.streetId || data.streetId === filter.streetId)).sort((a, b) => a.entry.entityId.localeCompare(b.entry.entityId));
}

export async function bulkChangePgvCatalogs(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof bulkSchema>): Promise<PropertyRegistryRecord[]> {
  const input = bulkSchema.parse(raw);
  if (new Set(input.expected.map(row => row.id)).size !== input.expected.length) throw new Error("PGVs repetidas na seleção.");
  return withDatabaseTransaction(connection, async tx => {
    for (const row of [...input.expected].sort((a, b) => a.id.localeCompare(b.id))) await lockPropertyKey(tx, `FISCAL_CATALOG_ID:${row.id}`);
    const selection = await readPgvBulkSelection(tx, actor, input.filter);
    if (selection.length !== input.expected.length || selection.some(({ entry }) => !input.expected.some(row => row.id === entry.entityId && row.version === entry.version))) throw new Error("A seleção ou versão das PGVs mudou. Refaça a prévia.");
    const updated: PropertyRegistryRecord[] = [];
    for (const { entry, data } of selection) updated.push(await publishFiscalCatalogInTransaction(tx, actor, { ...data, ...input.patch, ...(input.patch.catalogValues ? { catalogValues: { ...data.catalogValues, ...input.patch.catalogValues } } : {}), catalogId: entry.entityId, expectedVersion: entry.version, legalBasis: input.legalBasis }));
    await appendPropertyAudit(tx, { action: "BULK_CHANGE_PGV", entityType: "FISCAL_CATALOG", entityId: input.filter.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: propertySnapshot({ filter: input.filter, before: input.expected, after: updated.map(row => row.id), patch: input.patch, legalBasis: input.legalBasis }) });
    return updated;
  }, { isolationLevel: "serializable", timeoutMs: 60000 });
}
