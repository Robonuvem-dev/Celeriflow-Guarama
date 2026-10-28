import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

export async function createPersonnelDocumentaryFixture() {
  const pg = new PGlite();
  try {
    const baseline = readFileSync("prisma/migrations-ibema/20261009232000_baseline/migration.sql", "utf8");
    const foundation = readFileSync("prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql", "utf8");
    const temporal = readFileSync("prisma/migrations-ibema/20261011130000_hr_contract_temporal_revisions/migration.sql", "utf8");
    const tables = new Set(["Employee", "Role", "HrEmploymentContract", "HrEmploymentRevision", "HrEmploymentRegime"]);
    const definitions = [...`${baseline}\n${foundation}\n${temporal}`.matchAll(/CREATE TABLE "([A-Za-z0-9_]+)" \([\s\S]*?\n\);/g)].filter(match => tables.has(match[1]));
    assert.equal(definitions.length, tables.size);
    for (const definition of definitions) await pg.exec(definition[0]);
    for (const statement of temporal.matchAll(/ALTER TABLE "HrEmploymentRevision" (?:ADD COLUMN|ALTER COLUMN)[^;]+;/g)) await pg.exec(statement[0]);
    return { db: drizzle(pg), close: () => pg.close() };
  } catch (error) { await pg.close(); throw error; }
}
