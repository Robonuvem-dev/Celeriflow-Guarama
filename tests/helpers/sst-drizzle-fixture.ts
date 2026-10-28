import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

function historicalStatement(migration: string, marker: string) {
  const source = readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8");
  const start = source.indexOf(marker), end = source.indexOf(";", start);
  assert.ok(start >= 0 && end > start, `SQL histórico ausente: ${migration}: ${marker}`);
  return source.slice(start, end + 1);
}

/** Replay named historical table definitions and their indexes. SST migrations
 * supplied by each suite retain their real checks, foreign keys and triggers. */
export async function createSstDrizzleFixture(tables: string[], migrations: string[] = []) {
  const local = await createLocalDrizzleDatabase();
  try {
    const baseline = readFileSync("prisma/migrations-ibema/20261009232000_baseline/migration.sql", "utf8");
    for (const table of tables) {
      const start = baseline.indexOf(`CREATE TABLE "${table}" (`);
      const end = baseline.indexOf("\n);", start);
      assert.ok(start >= 0 && end > start, `Definição histórica ausente: ${table}`);
      await local.database.exec(baseline.slice(start, end + 3));
    }
    for (const match of baseline.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([A-Za-z0-9_]+)"[^;]+;/g)) {
      if (tables.includes(match[1])) await local.database.exec(match[0]);
    }
    // Complete the exact shared read projections used by SST. Replay only the
    // named authoritative ALTERs; assistential tables are not fixture inputs.
    if (tables.includes("Person")) {
      await local.database.exec(historicalStatement("20261010100000_complete_cemetery_domain", 'ALTER TABLE "Person"'));
      await local.database.exec(historicalStatement("20261015020000_health_registration_identity", 'ALTER TABLE "Person" ALTER COLUMN "cpf"'));
      await local.database.exec(historicalStatement("20261015020000_health_registration_identity", 'ALTER TABLE "Person" ADD COLUMN "motherUnknown"'));
    }
    if (tables.includes("Material")) await local.database.exec(historicalStatement("20261014130000_material_subcategories", 'ALTER TABLE "Material" ADD COLUMN "subcategoryId"'));
    for (const migration of migrations) await local.database.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    return local;
  } catch (error) { await local.close(); throw error; }
}
