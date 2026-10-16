import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";

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
    for (const model of Prisma.dmmf.datamodel.models.filter((model) => model.name.startsWith("Construction"))) {
      const tableName = model.dbName || model.name;
      assert.equal(names.has(tableName), true, `Tabela gerada ${tableName} ausente no upgrade`);
      for (const field of model.fields.filter((field) => field.kind !== "object")) assert.equal(columnNames.has(`${tableName}.${field.dbName || field.name}`), true, `Coluna ${tableName}.${field.name} gerada mas ausente no upgrade`);
    }
    const seed = await db.query<{ total: number }>(`SELECT COUNT(*)::integer AS total FROM "ConstructionCatalogEntry" WHERE kind='CONSTRUCTION_TYPE'`);
    assert.equal(seed.rows[0].total, 14);
    const violations = await db.query<{ total: number }>(`SELECT COUNT(*)::integer AS total FROM pg_constraint WHERE contype='f' AND NOT convalidated`);
    assert.equal(violations.rows[0].total, 0);
  } finally { await db.close(); }
});
