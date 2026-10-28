import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Offline rehearsal: this script never loads environment variables or connects
// to Neon. Both targets are freshly created, disposable local PostgreSQL stores.
const snapshot = resolve(process.argv.find(value => value.startsWith("--snapshot="))?.slice(11) ?? ".agent/drizzle/database-before-2026-10-28T01-26-00.861Z");
const manifest = JSON.parse(readFileSync(join(snapshot, "manifest.json"), "utf8"));
const { catalog } = JSON.parse(readFileSync(join(snapshot, "catalog.json"), "utf8"));
const directory = join(".agent", "drizzle", `recovery-${new Date().toISOString().replaceAll(":", "-")}`);
mkdirSync(directory, { recursive: true });
const quote = value => `"${value.replaceAll('"', '""')}"`;
const qualified = (schema, name) => `${quote(schema)}.${quote(name)}`;
const key = row => `${row.schema ?? row.schemaname}.${row.table_name ?? row.name ?? row.sequencename}.${row.table_name ? row.name : ""}`;
const normalize = value => typeof value === "string" ? value.replaceAll("\r\n", "\n") : value;
const publicOnly = rows => rows.filter(row => (row.schema ?? row.schemaname) === "public" && row.table_name !== "_prisma_migrations" && row.name !== "_prisma_migrations");
const queries = {
  tables: `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,c.relrowsecurity AS row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S') ORDER BY n.nspname,c.relname`,
  columns: `SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,a.attnum AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attidentity AS identity,a.attgenerated AS generated,coll.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation coll ON coll.oid=a.attcollation WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum`,
  constraints: `SELECT n.nspname AS schema,c.relname AS table_name,co.conname AS name,co.contype AS type,co.condeferrable AS deferrable,co.condeferred AS initially_deferred,co.convalidated AS validated,pg_get_constraintdef(co.oid,true) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,co.conname`,
  indexes: `SELECT schemaname AS schema,tablename AS table_name,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename,indexname`,
  functions: `SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind IN ('f','p') ORDER BY n.nspname,p.proname,arguments`,
  triggers: `SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,t.tgname`,
  enums: `SELECT n.nspname AS schema,t.typname AS name,e.enumlabel AS label,e.enumsortorder AS position FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,t.typname,e.enumsortorder`,
  views: `SELECT schemaname AS schema,viewname AS name,definition FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,viewname`,
  sequences: `SELECT schemaname,sequencename,data_type,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text,last_value::text FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,sequencename`,
};

async function compareCatalog(pg, scope) {
  const differences = [];
  const counts = {};
  for (const [kind, query] of Object.entries(queries)) {
    const rows = (await pg.query(query)).rows;
    const filter = values => (scope === "public" ? publicOnly(values) : values).filter(row => kind !== "constraints" || row.type !== "n");
    // The disposable local server has its own owner role. Compare sequence
    // behavior/state, without claiming to reproduce Neon role provisioning.
    const stable = values => filter(values).map(row => Object.fromEntries(Object.entries(row).filter(([name]) => kind !== "sequences" || name !== "sequenceowner").map(([name, value]) => [name, normalize(value)])));
    const actual = stable(rows), expected = stable(catalog[kind]);
    counts[kind] = { expected: expected.length, actual: actual.length };
    const identity = row => `${key(row)}${row.arguments ?? ""}${row.label ?? ""}`;
    const actualByKey = new Map(actual.map(row => [identity(row), row]));
    for (const row of expected) {
      const found = actualByKey.get(identity(row));
      if (!found) differences.push({ kind, object: identity(row), difference: "missing" });
      else if (JSON.stringify(found) !== JSON.stringify(row)) differences.push({ kind, object: identity(row), difference: "changed", expected: row, actual: found });
      actualByKey.delete(identity(row));
    }
    for (const row of actualByKey.values()) differences.push({ kind, object: identity(row), difference: "extra" });
  }
  return { counts, differences, note: "PostgreSQL 18 named NOT NULL constraints compared through column not_null; PostgreSQL 17 stores the same invariant on pg_attribute." };
}

async function replay() {
  const pg = new PGlite(join(directory, "replayed"));
  const applied = [];
  try {
    const migrations = readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of migrations) {
      const sql = readFileSync(join("prisma/migrations-ibema", name, "migration.sql"), "utf8");
      try { await pg.exec(sql); }
      catch (error) { throw new Error(`Migration replay failed: ${name} [${error.code ?? "unknown"}] ${error.message}`, { cause: error }); }
      applied.push({ name, sha256: createHash("sha256").update(sql).digest("hex") });
    }
    const comparison = await compareCatalog(pg, "public");
    const report = { mode: "OFFLINE EMPTY DATABASE REPLAY", version: (await pg.query("SELECT version() AS version")).rows[0].version, applied, ...comparison };
    writeFileSync(join(directory, "replay.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, migrations: applied.length, differences: comparison.differences.length, directory }));
    assert.equal(comparison.differences.length, 0, "Replayed catalog differs; inspect replay.json");
  } finally { await pg.close(); }
}

async function restore() {
  assert.equal(manifest.snapshotData, true);
  assert.equal(catalog.policies.length, 0, "RLS policies require an explicit restore handler");
  assert.ok(catalog.tables.every(table => ["r", "S", "v"].includes(table.kind)), "Unsupported relation kind");
  assert.ok(catalog.columns.every(column => !column.generated && !column.identity), "Generated/identity columns require an explicit restore handler");
  assert.ok(catalog.extensions.every(extension => extension.name === "plpgsql"), "Unconfigured extension");
  const pg = new PGlite(join(directory, "restored"));
  const verified = [];
  try {
    await pg.exec("SET check_function_bodies=off; SET timezone='UTC'; SET datestyle='ISO, MDY';");
    for (const schema of new Set(catalog.tables.map(table => table.schema))) await pg.exec(`CREATE SCHEMA IF NOT EXISTS ${quote(schema)}`);
    for (const rows of Object.values(Object.groupBy(catalog.enums, row => `${row.schema}.${row.name}`))) {
      await pg.exec(`CREATE TYPE ${qualified(rows[0].schema, rows[0].name)} AS ENUM (${rows.map(row => `'${row.label.replaceAll("'", "''")}'`).join(",")})`);
    }
    for (const sequence of catalog.sequences) {
      await pg.exec(`CREATE SEQUENCE ${qualified(sequence.schemaname, sequence.sequencename)} AS ${sequence.data_type} INCREMENT BY ${sequence.increment_by} MINVALUE ${sequence.min_value} MAXVALUE ${sequence.max_value} START WITH ${sequence.start_value} CACHE ${sequence.cache_size} ${sequence.cycle ? "CYCLE" : "NO CYCLE"}`);
      if (sequence.last_value !== null) await pg.query("SELECT setval($1::regclass,$2::bigint,true)", [qualified(sequence.schemaname, sequence.sequencename), sequence.last_value]);
    }
    for (const table of catalog.tables.filter(table => table.kind === "r")) {
      const columns = catalog.columns.filter(column => column.schema === table.schema && column.table_name === table.name);
      await pg.exec(`CREATE TABLE ${qualified(table.schema, table.name)} (${columns.map(column => `${quote(column.name)} ${column.type}${column.not_null ? " NOT NULL" : ""}`).join(",")})`);
    }
    for (const fn of catalog.functions) await pg.exec(fn.definition);
    for (const column of catalog.columns.filter(column => column.default_expression)) await pg.exec(`ALTER TABLE ${qualified(column.schema, column.table_name)} ALTER COLUMN ${quote(column.name)} SET DEFAULT ${column.default_expression}`);
    for (const table of manifest.counts) {
      const bytes = readFileSync(join(snapshot, "tables", table.file));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), table.sha256, `${table.schema}.${table.table} snapshot checksum`);
      const lines = bytes.toString("utf8").split("\n").filter(Boolean);
      assert.equal(lines.length, table.rows);
      const name = qualified(table.schema, table.table);
      for (let offset = 0; offset < lines.length; offset += 500) {
        // Send original JSON text straight into PostgreSQL's typed records:
        // no JavaScript parsing/rounding of numeric or temporal columns.
        await pg.query(`INSERT INTO ${name} SELECT * FROM json_populate_recordset(NULL::${name},$1::json)`, [`[${lines.slice(offset, offset + 500).join(",")}]`]);
      }
      const restored = (await pg.query(`SELECT row_to_json(t)::text AS value FROM ${name} t`)).rows.map(row => row.value).sort();
      const digest = values => createHash("sha256").update(values.map(line => `${line}\n`).join("")).digest("hex");
      assert.equal(restored.length, table.rows, `${name} row count`);
      assert.equal(digest(restored), digest(lines.sort()), `${name} exact row checksum`);
      verified.push({ schema: table.schema, table: table.table, rows: table.rows, sha256: digest(restored) });
    }
    // Data is restored before constraints/triggers, as with pg_restore. Adding
    // validated constraints now also checks every restored FK and CHECK.
    for (const type of ["p", "u", "c", "x"]) for (const constraint of catalog.constraints.filter(row => row.type === type)) {
      await pg.exec(`ALTER TABLE ${qualified(constraint.schema, constraint.table_name)} ADD CONSTRAINT ${quote(constraint.name)} ${constraint.definition}`);
    }
    const existingIndexes = new Set((await pg.query("SELECT schemaname, indexname FROM pg_indexes")).rows.map(row => `${row.schemaname}.${row.indexname}`));
    for (const index of catalog.indexes) if (!existingIndexes.has(`${index.schema}.${index.name}`)) await pg.exec(index.definition);
    // Some composite references target standalone UNIQUE indexes, rather than
    // UNIQUE constraints; those indexes must exist before their foreign keys.
    for (const constraint of catalog.constraints.filter(row => row.type === "f")) await pg.exec(`ALTER TABLE ${qualified(constraint.schema, constraint.table_name)} ADD CONSTRAINT ${quote(constraint.name)} ${constraint.definition}`);
    for (const view of catalog.views) await pg.exec(`CREATE VIEW ${qualified(view.schema, view.name)} AS ${view.definition}`);
    for (const trigger of catalog.triggers) {
      await pg.exec(trigger.definition);
      const mode = { O: "ENABLE", D: "DISABLE", R: "ENABLE REPLICA", A: "ENABLE ALWAYS" }[trigger.enabled];
      assert.ok(mode);
      await pg.exec(`ALTER TABLE ${qualified(trigger.schema, trigger.table_name)} ${mode} TRIGGER ${quote(trigger.name)}`);
    }
    for (const table of catalog.tables.filter(table => table.row_security)) await pg.exec(`ALTER TABLE ${qualified(table.schema, table.name)} ENABLE ROW LEVEL SECURITY`);
    const comparison = await compareCatalog(pg, "all");
    const report = { mode: "OFFLINE SNAPSHOT RESTORE", source: snapshot, version: (await pg.query("SELECT version() AS version")).rows[0].version, tables: verified.length, records: verified.reduce((sum, row) => sum + row.rows, 0), verified, ...comparison };
    writeFileSync(join(directory, "restore.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, tables: report.tables, records: report.records, differences: comparison.differences.length, directory }));
    assert.equal(comparison.differences.length, 0, "Restored catalog differs; inspect restore.json");
  } finally { await pg.close(); }
}

try {
  if (!process.argv.includes("--restore") || process.argv.includes("--replay")) await replay();
  if (process.argv.includes("--restore")) await restore();
} catch (error) {
  writeFileSync(join(directory, "failure.json"), JSON.stringify({ message: error.message, code: error.cause?.code, detail: error.cause?.detail }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
}
