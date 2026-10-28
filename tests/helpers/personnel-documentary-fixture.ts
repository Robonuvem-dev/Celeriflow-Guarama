import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export async function createPersonnelDocumentaryFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const baseline = readFileSync("prisma/migrations-ibema/20261009232000_baseline/migration.sql", "utf8");
    const foundation = readFileSync("prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql", "utf8");
    const temporal = readFileSync("prisma/migrations-ibema/20261011130000_hr_contract_temporal_revisions/migration.sql", "utf8");
    const tables = new Set(["Employee", "Role", "HrEmploymentContract", "HrEmploymentRevision", "HrEmploymentRegime"]);
    const definitions = [...`${baseline}\n${foundation}\n${temporal}`.matchAll(/CREATE TABLE "([A-Za-z0-9_]+)" \([\s\S]*?\n\);/g)].filter(match => tables.has(match[1]));
    assert.equal(definitions.length, tables.size);
    for (const definition of definitions) await fixture.database.exec(definition[0]);
    for (const statement of temporal.matchAll(/ALTER TABLE "HrEmploymentRevision" (?:ADD COLUMN|ALTER COLUMN)[^;]+;/g)) await fixture.database.exec(statement[0]);
    return { db: fixture.connection.db, close: fixture.close };
  } catch (error) { await fixture.close(); throw error; }
}
