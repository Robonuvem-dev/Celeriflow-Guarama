import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { validateHistoricalProvenance } from "./database-migrate-provenance.mjs";

// Read-only verification: never deploys, resolves, resets or rewrites migrations.
loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
async function main() {
const connection = createDatabaseConnection(process.env.DATABASE_URL!);
try {
  const directory = join(process.cwd(), "prisma", "migrations-ibema");
  const local = new Map<string, Set<string>>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bytes = await readFile(join(directory, entry.name, "migration.sql"));
    const lf = bytes.toString("utf8").replace(/\r\n/g, "\n");
    // Uniform checkout variants contain exactly the same normalized SQL bytes.
    const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
    const variants = new Set([bytes, Buffer.from(lf), Buffer.from(lf.replace(/\n/g, "\r\n"))].map(hash));
    const artifact = join(process.cwd(), "db", "historical-provenance", `${entry.name}.json`);
    if (existsSync(artifact)) {
      const proof = JSON.parse(await readFile(artifact, "utf8"));
      const validated = validateHistoricalProvenance(bytes, proof, { name: entry.name, source: `prisma/migrations-ibema/${entry.name}/migration.sql`, installedChecksum: proof.installedChecksum, lfChecksum: hash(lf) });
      variants.add(hash(validated.reconstructedBytes));
    }
    local.set(entry.name, variants);
  }
  const applied = await withDatabaseTransaction(connection, async tx => (await tx.execute<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>(sql`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`)).rows, { isolationLevel: "repeatable read", accessMode: "read only" });
  const issues: string[] = [];
  const successful = new Set<string>();
  for (const row of applied) {
    if (row.rolled_back_at) continue;
    if (!row.finished_at) { issues.push(`${row.migration_name}: execução incompleta`); continue; }
    successful.add(row.migration_name);
    if (!local.has(row.migration_name)) issues.push(`${row.migration_name}: ausente localmente`);
    else if (!local.get(row.migration_name)!.has(row.checksum)) issues.push(`${row.migration_name}: checksum divergente`);
  }
  console.log(JSON.stringify({ local: local.size, applied: successful.size, pending: [...local.keys()].filter(name => !successful.has(name)).sort(), issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} finally {
  await connection.pool.end();
}
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha ao verificar histórico de migrations."); process.exitCode = 1; });
