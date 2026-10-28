import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { insertToolRows, openCrossDomainDatabase, queryRows, requireAdministrator } from "./lib/cross-domain-database";
import { readPlanningCatalogs } from "./lib/cross-domain-planning-catalogs";
import { createHash } from "node:crypto";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function main() {
  const connection = openCrossDomainDatabase(2_000);
  const { db } = connection;
  try {
    const apply = process.argv.includes("--apply");
    const originals = await readPlanningCatalogs(db, ["p1-poc-catalog-2024", "p1-poc-catalog-2025", "p1-poc-catalog-2026", "p1-poc-catalog-2027", "p1-poc-tax-matrix-2026-v1"]);
    const before = hash(originals);
    const sources = await queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "ResourceSource"`), revenues = await queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "RevenueNature"`), expenses = await queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "ExpenseNature"`);
    const lookup = { SOURCE: sources, REVENUE: revenues, EXPENSE: expenses };
    const plan = originals.map(source => ({ source, id: `aurora-names-v2:${source.id}`, label: source.id.includes("tax-matrix") ? "Aurora das Veredas — matriz tributária de referência 2026" : `Aurora das Veredas — classificações de referência ${source.year}`, rows: source.entries.map(entry => {
      const canonical = lookup[entry.kind as keyof typeof lookup]?.find(row => row.id === entry.canonicalId);
      return { id: `aurora-names-v2:${entry.id}`, kind: entry.kind, code: source.status === "PUBLISHED" ? entry.code : canonical?.code || entry.code, name: canonical?.name || entry.name, parentCode: entry.parentCode, degree: entry.degree, canonicalId: entry.canonicalId, attributes: { ...object(entry.attributes), presentationPredecessorEntryId: entry.id, presentationPredecessorVersionId: source.id, presentationEffectiveFrom: "2026-10-14" } };
    }) }));
    const results = [];
    const actor = apply ? await requireAdministrator(db) : null;
    for (const item of plan) {
      const sourceHash = hash({ source: item.source.sourceHash, label: item.label, rows: item.rows });
      const [existing] = await readPlanningCatalogs(db, [item.id]);
      if (existing && (existing.sourceHash !== sourceHash || existing.entries.length !== item.rows.length)) throw new Error("Revisão existente diverge da origem; não sobrescrever.");
      if (apply && !existing) await withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('AURORA_NAME_CATALOG_REVISION_V2'))`);
        const [current] = await readPlanningCatalogs(tx, [item.source.id]);
        if (hash(current) !== hash(item.source)) throw new Error("Origem alterada durante a prévia.");
        await insertToolRows(tx, "PlanningCatalogVersion", { id: item.id, year: item.source.year, label: item.label, normativeReference: "Revisão cadastral de nomes autorizada pelo responsável em 14/10/2026. Procedência e limitações da edição de origem preservadas em seus metadados; sem homologação normativa presumida.", sourceHash, createdById: actor!.id, status: "DRAFT" });
        await insertToolRows(tx, "PlanningCatalogEntry", item.rows.map(row => ({ ...row, versionId: item.id })));
        if (item.source.status === "PUBLISHED") await tx.execute(sql`UPDATE "PlanningCatalogVersion" SET status='PUBLISHED' WHERE id=${item.id}`);
        await insertToolRows(tx, "FinancialAuditLog", { action: "MUNICIPAL_CATALOG_NAME_REVISION", entityType: "PlanningCatalogVersion", entityId: item.id, authorUsuarioId: actor!.id, payload: { sourceVersionId: item.source.id, sourceHash: item.source.sourceHash, revisionHash: sourceHash, entries: item.rows.length, oldVersionPreserved: true, fictional: true, authorizationsPreserved: true } });
      }, { timeoutMs: 120000, lockTimeoutMs: 120000 });
      results.push({ source: item.source.id, version: item.id, status: item.source.status, entries: item.rows.length, created: apply && !existing, reused: Boolean(existing) });
    }
    const after = await readPlanningCatalogs(db, originals.map(row => row.id));
    if (hash(after) !== before) throw new Error("Edições históricas divergiram durante a revisão.");
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW", results, historyPreserved: true }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na revisão dos catálogos."); process.exitCode = 1; });
