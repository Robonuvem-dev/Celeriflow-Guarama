import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
const test = process.argv.includes("--test");
const url = test ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!url) throw new Error("Database URL is required.");
const sql = neon(url);
const migrationName = "20261010130000_add_master_data_foundation";
if (!test) {
  const migrations = await sql`SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = ${migrationName}`;
  const expected = createHash("sha256").update(readFileSync(`prisma/migrations-ibema/${migrationName}/migration.sql`)).digest("hex");
  assert.ok(migrations.some(row => row.finished_at && !row.rolled_back_at && row.checksum === expected), "Applied foundation migration must match the local SQL.");
}
const tables = ["Family", "FamilyMember", "GovernmentEntity", "LegalText", "LegalTextVersion", "LegalTextRelation", "LegalReportSigner", "Bank", "BankBranch", "Currency", "State", "City", "MasterDataConsistencyRun", "MasterDataConsistencyIssue"];
const existing = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
for (const name of tables) assert.ok(existing.some(row => row.table_name === name), `Missing table ${name}`);
const columns = await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
for (const [table, column] of [["BankAccount", "bankId"], ["BankAccount", "bankBranchId"], ["Neighborhood", "status"], ["SocialFamily", "masterFamilyId"], ["HealthFamily", "masterFamilyId"]]) {
  assert.ok(columns.some(row => row.table_name === table && row.column_name === column), `Missing ${table}.${column}`);
}
const entities = await sql`SELECT code FROM "GovernmentEntity" WHERE code IN ('EXECUTIVO_IBEMA', 'CAMARA_IBEMA')`;
assert.equal(entities.length, 2, "Executive and Chamber must have separate entity records.");
const cities = await sql`SELECT c."ibgeCode" FROM "City" c JOIN "State" s ON s.id = c."stateId" WHERE c."ibgeCode" = '4109757' AND s.uf = 'PR'`;
assert.equal(cities.length, 1);
const currencies = await sql`SELECT "isoCode" FROM "Currency" WHERE "isDefault" = true`;
assert.equal(currencies.length, 1);
assert.equal(currencies[0].isoCode, "BRL");
const banks = await sql`SELECT compe FROM "Bank" WHERE compe IN ('001', '104')`;
assert.equal(banks.length, 2);
const taxes = await sql`SELECT code FROM "Tax" WHERE code IN ('IPTU', 'ISSQN', 'ITBI')`;
assert.equal(taxes.length, 3);
const invalidSigners = await sql`SELECT count(*)::int AS count FROM "LegalReportSigner" WHERE ("personId" IS NULL) = ("employeeId" IS NULL) OR "signatureOrder" < 1`;
assert.equal(invalidSigners[0].count, 0);
const social = await sql`SELECT count(*)::int AS count FROM "SocialFamily" WHERE "masterFamilyId" IS NULL`;
console.log(`Master data verified (${test ? "test" : "operational"}): tables, links, reference data and signer identities. Social profiles without canonical family: ${social[0].count}.`);
