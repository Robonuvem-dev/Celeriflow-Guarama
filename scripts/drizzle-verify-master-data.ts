import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { loadMasterDataPage } from "../src/db/repositories/registry/master-data-queries";
import { loadConsistencyIssues, loadConsistencyRuns, loadRegistryDashboard, loadRegistryOrganogram } from "../src/db/repositories/registry/overview";
import { readCanonicalDatabaseIdentityIssues } from "../src/db/repositories/registry/consistency";
import type { MasterDataCatalog, MasterDataColumn, MasterDataField, MasterDataRow } from "../src/app/app-domain/cadastros/master-data-types";
import type { CanonicalIdentitySource } from "../src/lib/cadastros/canonical-identity-policy";
import type { AdministrativeUnitRecord, DepartmentRecord, SecretariatRecord } from "../src/lib/contracts/administration";
import type { ConsistencyRunRecord } from "../src/lib/contracts/master-data";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";
import { expectedCanonicalIssues } from "./sql-oracle-policies";
import { expectedMasterData } from "./sql-oracle-master-data";
import { expectedMasterMetadata } from "./sql-oracle-master-metadata";
import { currentMasterMetadataReader } from "./sql-oracle-current-master-metadata";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
type PageResult = { rows: MasterDataRow[]; total: number; fields: MasterDataField[]; columns: MasterDataColumn[] };

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  const catalogs: MasterDataCatalog[] = ["families", "entities", "costCenters", "cities", "neighborhoods", "streets", "banks", "branches", "taxes", "currencies", "products", "cbos", "signers", "legalTexts"];
  const scenarios: Record<string, string>[] = [{}, { q: "a" }, { q: "%_" }, { q: "' OR 1=1 --" }, { page: "2" }, { q: "missing-drizzle-master-fixture" }];
  let comparisons = 0;
  function normalize(result: PageResult, catalog: MasterDataCatalog): PageResult {
    // Only cost-center selectors lacked ordering in the original contract.
    return { ...result, fields: result.fields.map(field => catalog === "costCenters" && field.options ? { ...field, options: [...field.options].sort((a, b) => a.value.localeCompare(b.value)) } : field) };
  }
  try {
    const currentMetadata = currentMasterMetadataReader(readFileSync("src/app/app-domain/cadastros/master-data-page.tsx", "utf8"));
    for (const catalog of catalogs) for (const search of scenarios) {
      const query = search.q?.trim() || "", page = Math.max(1, Number.parseInt(search.page || "1", 10) || 1);
      const expectedData = await expectedMasterData(connection, catalog, query, page);
      const actualData = await loadMasterDataPage(connection.db, catalog, query, page);
      const expected = { rows: expectedData.rows, total: expectedData.total, ...expectedMasterMetadata(catalog, expectedData.options) };
      const actual = { rows: actualData.rows, total: actualData.total, ...currentMetadata(catalog, actualData.options) };
      assert.deepEqual(normalize(actual, catalog), normalize(expected, catalog), `${catalog} ${JSON.stringify(search)}`);
      comparisons++;
    }
    const db = connection.db;
    const identity: CanonicalIdentitySource = {
      persons: await connection.rows<CanonicalIdentitySource["persons"][number]>('SELECT id,cpf FROM "Person"'),
      companies: await connection.rows<CanonicalIdentitySource["companies"][number]>('SELECT id,cnpj FROM "Company"'),
      taxpayers: await connection.rows<CanonicalIdentitySource["taxpayers"][number]>('SELECT id,"taxpayerType","personId","companyId" FROM "Taxpayer"'),
      suppliers: await connection.rows<CanonicalIdentitySource["suppliers"][number]>('SELECT id,"personId","companyId" FROM "Supplier"'),
      creditors: await connection.rows<CanonicalIdentitySource["creditors"][number]>('SELECT id,"personId","companyId","supplierId",document FROM "Creditor"'),
    };
    assert.deepEqual(await readCanonicalDatabaseIdentityIssues(db), expectedCanonicalIssues(identity)); comparisons++;
    const tables = ["Person", "Company", "Supplier", "RealEstate", "Family", "GovernmentEntity", "CostCenter", "City", "LegalText", "Bank", "Currency", "CatalogItem"];
    const totals = await Promise.all(tables.map(table => connection.count(`SELECT count(*)::int AS count FROM "${table}"`)));
    const latest = await connection.first<{ id: string }>('SELECT id FROM "MasterDataConsistencyRun" WHERE area=$1 AND status=$2 ORDER BY "startedAt" DESC LIMIT 1', ["CADASTROS", "CONCLUIDA"]);
    const qualidade = latest ? await connection.count('SELECT count(*)::int AS count FROM "MasterDataConsistencyIssue" WHERE "runId"=$1 AND status=$2', [latest.id, "ABERTA"]) : 0;
    assert.deepEqual(await loadRegistryDashboard(db), { persons: totals[0], companies: totals[1], suppliers: totals[2], realEstates: totals[3], geral: totals[4] + totals[5], estrutura: totals[6] + totals[7], referencias: totals[8] + totals[9] + totals[10] + totals[11], qualidade }); comparisons++;
    const secretariats = await connection.rows<SecretariatRecord>('SELECT * FROM "Secretariat" ORDER BY name ASC');
    const departments = await connection.rows<DepartmentRecord>('SELECT * FROM "Department" ORDER BY name ASC');
    const units = await connection.rows<AdministrativeUnitRecord>('SELECT * FROM "AdministrativeUnit" ORDER BY name ASC');
    const expectedOrganogram = secretariats.map(row => ({ ...row, departments: departments.filter(item => item.secretariatId === row.id), units: units.filter(item => item.secretariatId === row.id) }));
    assert.deepEqual(await loadRegistryOrganogram(db), expectedOrganogram); comparisons++;
    for (const requested of [undefined, "missing-drizzle-master-fixture"]) {
      const runRows = await connection.rows<ConsistencyRunRecord>('SELECT * FROM "MasterDataConsistencyRun" WHERE area=$1 ORDER BY "startedAt" DESC LIMIT 8', ["CADASTROS"]);
      const runs = await Promise.all(runRows.map(async row => ({ ...row, _count: { issues: await connection.count('SELECT count(*)::int AS count FROM "MasterDataConsistencyIssue" WHERE "runId"=$1', [row.id]) } })));
      const selectedRun = await connection.first<{ id: string }>('SELECT id FROM "MasterDataConsistencyRun" WHERE area=$1 AND ($2::text IS NULL OR id=$2) ORDER BY "startedAt" DESC LIMIT 1', ["CADASTROS", requested || null]);
      assert.deepEqual(await loadConsistencyRuns(db, requested), { runs, selectedRun });
      for (const page of [1, 2]) {
        const runId = selectedRun?.id || "__none__";
        const issues = await connection.rows('SELECT * FROM "MasterDataConsistencyIssue" WHERE area=$1 AND "runId"=$2 ORDER BY severity ASC,"detectedAt" DESC LIMIT 20 OFFSET $3', ["CADASTROS", runId, (page - 1) * 20]);
        const total = await connection.count('SELECT count(*)::int AS count FROM "MasterDataConsistencyIssue" WHERE area=$1 AND "runId"=$2', ["CADASTROS", runId]);
        assert.deepEqual(await loadConsistencyIssues(db, runId, page), { issues, total }); comparisons++;
      }
      comparisons++;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, catalogs: catalogs.length, scenariosPerCatalog: scenarios.length, scope: "Independent SQL DTOs, frozen columns/fields/selector contract vs live metadata; dashboard, organogram, canonical integrity and quality pagination" }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
