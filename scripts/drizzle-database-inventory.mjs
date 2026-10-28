import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada.");
const destination = new URL(connectionString);
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 30_000 });
const client = await pool.connect();
const timestamp = new Date().toISOString().replaceAll(":", "-");
const directory = join(".agent", "drizzle", `database-before-${timestamp}`);
const quote = identifier => `"${identifier.replaceAll('"', '""')}"`;
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const identity = (await client.query("SELECT current_database() AS database, version() AS version, now() AS captured_at, pg_current_wal_lsn()::text AS wal_lsn")).rows[0];
  console.log(JSON.stringify({ mode: "READ ONLY", host: destination.hostname, database: identity.database, directory }));
  const queries = {
    tables: `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,c.relrowsecurity AS row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S') ORDER BY n.nspname,c.relname`,
    columns: `SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,a.attnum AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attidentity AS identity,a.attgenerated AS generated,coll.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation coll ON coll.oid=a.attcollation WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum`,
    constraints: `SELECT n.nspname AS schema,c.relname AS table_name,co.conname AS name,co.contype AS type,co.condeferrable AS deferrable,co.condeferred AS initially_deferred,co.convalidated AS validated,pg_get_constraintdef(co.oid,true) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,co.conname`,
    indexes: `SELECT schemaname AS schema,tablename AS table_name,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename,indexname`,
    functions: `SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind IN ('f','p') ORDER BY n.nspname,p.proname,arguments`,
    triggers: `SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,t.tgname`,
    enums: `SELECT n.nspname AS schema,t.typname AS name,e.enumlabel AS label,e.enumsortorder AS position FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,t.typname,e.enumsortorder`,
    sequences: `SELECT * FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,sequencename`,
    views: `SELECT schemaname AS schema,viewname AS name,definition FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,viewname`,
    policies: `SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname`,
    extensions: `SELECT extname AS name,extversion AS version FROM pg_extension ORDER BY extname`,
  };
  const catalog = {};
  for (const [name, query] of Object.entries(queries)) catalog[name] = (await client.query(query)).rows;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "catalog.json"), JSON.stringify({ identity, catalog }, null, 2));
  const counts = [];
  if (process.argv.includes("--snapshot-data")) {
    mkdirSync(join(directory, "tables"));
    for (const table of catalog.tables.filter(table => table.kind === "r" || table.kind === "p")) {
      const qualified = `${quote(table.schema)}.${quote(table.name)}`;
      const file = `${encodeURIComponent(table.schema)}.${encodeURIComponent(table.name)}.jsonl`;
      const stream = createWriteStream(join(directory, "tables", file), { flags: "wx" });
      const hash = createHash("sha256");
      let count = 0;
      // A server-side cursor bounds memory without converting exact numerics or dates.
      await client.query(`DECLARE migration_inventory NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS value FROM ${qualified} t`);
      try {
        while (true) {
          const rows = (await client.query("FETCH FORWARD 1000 FROM migration_inventory")).rows;
          if (!rows.length) break;
          for (const row of rows) {
            const line = `${row.value}\n`;
            hash.update(line);
            if (!stream.write(line)) await once(stream, "drain");
            count++;
          }
        }
      } finally { await client.query("CLOSE migration_inventory"); stream.end(); await once(stream, "finish"); }
      counts.push({ schema: table.schema, table: table.name, rows: count, file, sha256: hash.digest("hex") });
    }
  } else {
    for (const table of catalog.tables.filter(table => table.kind === "r" || table.kind === "p")) {
      const result = await client.query(`SELECT count(*)::text AS count FROM ${quote(table.schema)}.${quote(table.name)}`);
      counts.push({ schema: table.schema, table: table.name, rows: Number(result.rows[0].count) });
    }
  }
  await client.query("COMMIT");
  const summary = { capturedAt: new Date().toISOString(), host: destination.hostname, database: identity.database, walLsn: identity.wal_lsn, directory, snapshotData: process.argv.includes("--snapshot-data"), tables: counts.length, records: counts.reduce((sum, table) => sum + table.rows, 0), objects: Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, value.length])), counts };
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(summary, null, 2));
  // Public evidence contains counts and metadata, never row contents or credentials.
  mkdirSync("docs/drizzle-inventory", { recursive: true });
  writeFileSync("docs/drizzle-inventory/database-before.json", JSON.stringify({ ...summary, counts: counts.map(({ schema, table, rows, sha256 }) => ({ schema, table, rows, sha256 })) }, null, 2));
  console.log(JSON.stringify({ ...summary, counts: undefined }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally { client.release(); await pool.end(); }
