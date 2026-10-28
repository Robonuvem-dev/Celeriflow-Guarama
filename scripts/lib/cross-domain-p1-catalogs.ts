import { sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../src/db/transaction";
import type { JsonValue } from "../../src/db/json";
import { planningCatalogEntries, planningCatalogVersions } from "../../src/db/schema/planning-catalog";
import { financialAuditLogs } from "../../src/db/schema/finance-identity";
import { queryRows } from "./cross-domain-database";

export type P1CatalogEntryInput = typeof planningCatalogEntries.$inferInsert;
export type P1DraftCatalog = {
  id: string; year: number; label: string; normativeReference: string; sourceHash: string;
  entries: P1CatalogEntryInput[];
};

export async function firstActiveP1Actor(db: DatabaseExecutor): Promise<{ id: string }> {
  const [actor] = await queryRows<{ id: string }>(db, sql`SELECT id FROM "Usuario" WHERE ativo=true ORDER BY "createdAt" ASC LIMIT 1`);
  if (!actor) throw new Error("Usuário autor não encontrado.");
  return actor;
}

/** Only the three P1 reference importers use this explicit catalog/audit write.
 * No conflict is ignored: revised local versions must be checked by the caller. */
export async function insertP1DraftCatalog(tx: DatabaseTransaction, catalog: P1DraftCatalog, actorId: string, action: "IMPORT_CBO_DRAFT" | "IMPORT_CNAE_DRAFT" | "IMPORT_OFFICIAL_CATALOG", payload: JsonValue): Promise<void> {
  await tx.insert(planningCatalogVersions).values({ id: catalog.id, year: catalog.year, label: catalog.label, normativeReference: catalog.normativeReference, sourceHash: catalog.sourceHash, status: "DRAFT", createdById: actorId });
  for (let offset = 0; offset < catalog.entries.length; offset += 300) {
    await tx.insert(planningCatalogEntries).values(catalog.entries.slice(offset, offset + 300));
  }
  await tx.insert(financialAuditLogs).values({ action, entityType: "PlanningCatalogVersion", entityId: catalog.id, authorUsuarioId: actorId, payload });
}
