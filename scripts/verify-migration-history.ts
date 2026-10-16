import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Read-only verification: never deploys, resolves, resets or rewrites migrations.
loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
async function main() {
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
try {
  const directory = join(process.cwd(), "prisma", "migrations-ibema");
  const local = new Map<string, Set<string>>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bytes = await readFile(join(directory, entry.name, "migration.sql"));
    const lf = bytes.toString("utf8").replace(/\r\n/g, "\n");
    // Match Prisma's LF/CRLF tolerance across Windows and Linux checkouts.
    local.set(entry.name, new Set([bytes, Buffer.from(lf), Buffer.from(lf.replace(/\n/g, "\r\n"))].map(value => createHash("sha256").update(value).digest("hex"))));
  }
  const applied = await db.$transaction(tx => tx.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`, { isolationLevel: "RepeatableRead" });
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
  await db.$disconnect();
}
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha ao verificar histórico de migrations."); process.exitCode = 1; });
