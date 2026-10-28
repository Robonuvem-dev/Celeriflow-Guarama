import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as core from "../src/db/schema/construction-core";
import * as documents from "../src/db/schema/construction-documents";
import * as enforcement from "../src/db/schema/construction-enforcement";
import * as integrations from "../src/db/schema/construction-integrations";
import * as lifecycle from "../src/db/schema/construction-lifecycle";
import * as opening from "../src/db/schema/construction-opening";
import * as portal from "../src/db/schema/construction-portal";
import * as taxation from "../src/db/schema/construction-taxation";
import * as viability from "../src/db/schema/construction-viability";

test("upgrade completo do baseline municipal mantém integridade das migrations civis", { timeout: 180000 }, async () => {
  const db = new PGlite();
  try {
    const directory = "prisma/migrations-ibema";
    const migrations = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      const sql = readFileSync(join(directory, migration, "migration.sql"), "utf8");
      try { await db.exec(sql); } catch (error) { throw new Error(`Falha no upgrade ${migration}`, { cause: error }); }
    }
    const tables = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'Construction%'`);
    const names = new Set(tables.rows.map((row) => row.table_name));
    for (const required of ["ConstructionCase", "ConstructionReview", "ConstructionPortalIdentity", "ConstructionTermAcceptance", "ConstructionCompanyProfile", "ConstructionConsultation"]) assert.equal(names.has(required), true, `Tabela ${required} ausente`);
    const columns = await db.query<{ table_name: string; column_name: string }>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'Construction%'`);
    const columnNames = new Set(columns.rows.map((column) => `${column.table_name}.${column.column_name}`));
    const mappings = Object.values({ ...core, ...documents, ...enforcement, ...integrations, ...lifecycle, ...opening, ...portal, ...taxation, ...viability }).map(getTableConfig);
    for (const table of mappings) {
      assert.equal(names.has(table.name), true, `Tabela mapeada ${table.name} ausente no upgrade`);
      for (const column of table.columns) assert.equal(columnNames.has(`${table.name}.${column.name}`), true, `Coluna ${table.name}.${column.name} mapeada mas ausente no upgrade`);
    }
    await db.exec(readFileSync("db/migrations/20261028193000_construction_document_rejection/migration.sql", "utf8"));
    const mappedNames = new Set(mappings.map(table => table.name));
    for (const table of names) assert.equal(mappedNames.has(table), true, `Tabela física ${table} sem mapping de Construção`);
    const rejectionCheck = await db.query<{ definition: string; convalidated: boolean }>(`SELECT pg_get_constraintdef(oid) AS definition, convalidated FROM pg_constraint WHERE conrelid='"ConstructionDocumentRequest"'::regclass AND conname='ConstructionDocumentRequest_status_check'`);
    assert.equal(rejectionCheck.rows.length, 1);
    assert.equal(rejectionCheck.rows[0].convalidated, true);
    assert.deepEqual([...rejectionCheck.rows[0].definition.matchAll(/'([^']+)'/g)].map(match => match[1]), ["PENDING", "FULFILLED", "REJECTED"]);
    const seed = await db.query<{ total: number }>(`SELECT COUNT(*)::integer AS total FROM "ConstructionCatalogEntry" WHERE kind='CONSTRUCTION_TYPE'`);
    assert.equal(seed.rows[0].total, 14);
    const violations = await db.query<{ total: number }>(`SELECT COUNT(*)::integer AS total FROM pg_constraint WHERE contype='f' AND NOT convalidated`);
    assert.equal(violations.rows[0].total, 0);
  } finally { await db.close(); }
});
