import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../src/db/transaction";
import { identifier, insertToolRows, queryRows, readApplicationCatalog } from "./cross-domain-database";

export type RepopulationChange = { model: string; id: string; before: Record<string, string | null>; after: Record<string, string>; snapshot: Record<string, unknown> };

/** Full-row optimistic comparison and audit stay in the caller's transaction. */
export async function applyRepopulationChanges(tx: DatabaseTransaction, changes: RepopulationChange[], actorId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('PLAUSIBLE_CADASTROS_V1'))`);
  const catalog = await readApplicationCatalog(tx);
  for (const change of changes) {
    const model = catalog.find(item => item.name === change.model);
    if (!model) throw new Error(`Modelo não suportado: ${change.model}`);
    const assignments = Object.entries(change.after).map(([field, value]) => {
      if (!model.fields.some(column => column.name === field && column.isString && !column.isArray)) throw new Error(`Campo não suportado: ${change.model}.${field}`);
      return sql`${identifier(field)} = ${value}`;
    });
    if (model.fields.some(field => field.name === "updatedAt")) assignments.push(sql`"updatedAt" = CURRENT_TIMESTAMP`);
    const rows = await queryRows<{ row: Record<string, unknown> }>(tx, sql`UPDATE ${identifier(change.model)} t SET ${sql.join(assignments, sql`, `)} WHERE id = ${change.id} AND to_jsonb(t) = ${JSON.stringify(change.snapshot)}::jsonb RETURNING to_jsonb(t) AS row`);
    if (rows.length !== 1) throw new Error(`Cadastro alterado durante a prévia: ${change.model}/${change.id}`);
    for (const [field, previous] of Object.entries(change.snapshot)) {
      if (field === "updatedAt" || field in change.after) continue;
      if (JSON.stringify(rows[0].row[field]) !== JSON.stringify(previous)) throw new Error(`Campo fora do escopo alterado: ${change.model}.${field}`);
    }
    await insertToolRows(tx, "FinancialAuditLog", { action: "PLAUSIBLE_CADASTRO_UPDATED", entityType: change.model, entityId: change.id, authorUsuarioId: actorId, payload: { dataset: "aurora-cadastros-v1", fictional: true, before: change.before, after: change.after, credentialsPreserved: true } });
  }
}
