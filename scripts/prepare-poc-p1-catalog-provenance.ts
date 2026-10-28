import { config } from "dotenv";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { insertToolRows, openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";
import { readPlanningCatalogs } from "./lib/cross-domain-planning-catalogs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const prefix = "p0-current-";
const apply = process.argv.includes("--apply");

async function main() {
  const connection = openCrossDomainDatabase(2_000);
  const { db } = connection;
  try {
    const [sources, revenues, expenses, accounts, actor] = await Promise.all([
      queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "ResourceSource" WHERE starts_with(id,${`${prefix}source-`}) ORDER BY code ASC`),
      queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "RevenueNature" WHERE starts_with(id,${`${prefix}revenue-`}) ORDER BY code ASC`),
      queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "ExpenseNature" WHERE starts_with(id,${`${prefix}expense-`}) ORDER BY code ASC`),
      queryRows<{ id: string; code: string; name: string }>(db, sql`SELECT id,code,name FROM "AccountingPlan" WHERE starts_with(id,${`${prefix}account-`}) ORDER BY code ASC`),
      queryRows<{ id: string }>(db, sql`SELECT id FROM "Usuario" WHERE ativo=true ORDER BY "createdAt" ASC LIMIT 1`).then(rows => rows[0]),
    ]);
    if (!actor || [sources, revenues, expenses, accounts].some((rows) => rows.length !== 21)) throw new Error("A carga P0 e o usuário autor devem estar presentes antes da proveniência P1.");
    const rows = [
      ...sources.map((row) => ({ kind: "SOURCE", canonicalId: row.id, code: row.code, name: row.name })),
      ...revenues.map((row) => ({ kind: "REVENUE", canonicalId: row.id, code: row.code, name: row.name })),
      ...expenses.map((row) => ({ kind: "EXPENSE", canonicalId: row.id, code: row.code, name: row.name })),
      ...accounts.map((row) => ({ kind: "ACCOUNT", canonicalId: row.id, code: row.code, name: row.name })),
    ];
    // Accounting accounts are documented in the evidence manifest; the planning
    // catalog registry accepts only its existing SOURCE/REVENUE/EXPENSE kinds.
    const planningRows = rows.filter((row) => row.kind !== "ACCOUNT");
    const versions = [];
    for (const year of [2024, 2025, 2026, 2027]) {
      const source = { nature: "SYNTHETIC_POC_ONLY", origin: "scripts/prepare-poc-p0-current.ts", year, effectiveFrom: `${year}-01-01`, effectiveUntil: `${year}-12-31`, rows };
      const sourceHash = createHash("sha256").update(JSON.stringify(source)).digest("hex");
      const id = `p1-poc-catalog-${year}`;
      if (apply) await withDatabaseTransaction(connection, async (tx) => {
        const [prior] = await readPlanningCatalogs(tx, [id]);
        if (prior) {
          if (prior.sourceHash !== sourceHash || prior.status !== "DRAFT" || prior.entries.length !== planningRows.length) throw new Error(`Catálogo ${year} diverge da carga original; concilie a versão antes de continuar.`);
          return;
        }
        await insertToolRows(tx, "PlanningCatalogVersion", {
          id, year, label: `POC P1 — classificações sintéticas ${year}`, normativeReference: "Ensaio P0/P1 autorizado; não constitui PCASP, TCE/STN ou classificação municipal oficial.", sourceHash, status: "DRAFT", createdById: actor.id,
        });
        await insertToolRows(tx, "PlanningCatalogEntry", planningRows.map((row) => ({ ...row, versionId: id, degree: row.code.split(".").length, attributes: { synthetic: true, homologated: false, origin: source.origin, effectiveFrom: source.effectiveFrom, effectiveUntil: source.effectiveUntil, externalCode: null } })));
        await insertToolRows(tx, "FinancialAuditLog", { action: "POC_P1_CATALOG_PROVENANCE", entityType: "PlanningCatalogVersion", entityId: id, authorUsuarioId: actor.id, payload: { sourceHash, year, count: rows.length, synthetic: true, homologated: false } });
      }, { timeoutMs: 5000, lockTimeoutMs: 5000 });
      versions.push({ id, sourceHash, ...source });
    }
    const evidence = { generatedAt: new Date().toISOString(), mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versions, conclusion: "Origem e vigência de ensaio documentadas. As versões permanecem DRAFT e não homologam nem substituem catálogos oficiais." };
    if (apply) writeFileSync("docs/poc-p0/CLASSIFICACOES_ENSAIO_P1.json", `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ mode: evidence.mode, versions: versions.length, entriesPerVersion: planningRows.length, documentedAccountsPerYear: accounts.length, synthetic: true, homologated: false }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falha na proveniência P1."); process.exitCode = 1; });
