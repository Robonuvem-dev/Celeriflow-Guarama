import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--all")) throw new Error("Argumento inválido: use --all para conferir todos os módulos.");
  const allModules = args.includes("--all");
  const { prisma } = await import("../src/lib/prisma");
  try {
    const migrations = await prisma.$queryRaw<{ migration_name: string; checksum: string }[]>`
      SELECT migration_name, checksum FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    let checked = 0;
    const mismatches: string[] = [];
    const missing: string[] = [];
    for (const migration of migrations.filter((item) => allModules || item.migration_name.includes("sst"))) {
      const path = join("prisma", "migrations-ibema", migration.migration_name, "migration.sql");
      if (!existsSync(path)) { missing.push(migration.migration_name); continue; }
      const sql = readFileSync(path, "utf8");
      const lf = sql.replaceAll("\r\n", "\n");
      // Git may convert line endings. Accept only byte variants of those same statements.
      const hashes = new Set([sql, lf, lf.replaceAll("\n", "\r\n")].map((value) => createHash("sha256").update(value).digest("hex")));
      if (!hashes.has(migration.checksum)) mismatches.push(migration.migration_name);
      checked++;
    }
    console.log(JSON.stringify({ checked, mismatches, missing }));
    if (mismatches.length || missing.length) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error("Não foi possível conferir o histórico de migrações. Use somente --all ou nenhum argumento e verifique a conexão."); process.exitCode = 1; });
