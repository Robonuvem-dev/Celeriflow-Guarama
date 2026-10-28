import { readFileSync } from "node:fs";
import { sha256, stableJson } from "./database-migrate-files.mjs";

// Same PostgreSQL catalog projections used by the inventory/recovery evidence.
// No schema inference, Prisma metadata, or destructive schema synchronization.
const queries = {
  tables: `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,c.relrowsecurity AS row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S') ORDER BY n.nspname,c.relname`,
  columns: `SELECT n.nspname AS schema,c.relname AS table_name,a.attname AS name,a.attnum AS position,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attidentity AS identity,a.attgenerated AS generated,coll.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation coll ON coll.oid=a.attcollation WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum`,
  constraints: `SELECT n.nspname AS schema,c.relname AS table_name,co.conname AS name,co.contype AS type,co.condeferrable AS deferrable,co.condeferred AS initially_deferred,co.convalidated AS validated,pg_get_constraintdef(co.oid,true) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,co.conname`,
  indexes: `SELECT schemaname AS schema,tablename AS table_name,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename,indexname`,
  functions: `SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind IN ('f','p') ORDER BY n.nspname,p.proname,arguments`,
  triggers: `SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,t.tgname`,
  enums: `SELECT n.nspname AS schema,t.typname AS name,e.enumlabel AS label,e.enumsortorder AS position FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,t.typname,e.enumsortorder`,
  views: `SELECT schemaname AS schema,viewname AS name,definition FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,viewname`,
  sequences: `SELECT schemaname,sequencename,data_type,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,sequencename`,
  policies: `SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname`,
  extensions: `SELECT extname AS name,extversion AS version FROM pg_extension ORDER BY extname`,
};
const managedNames = new Set(["_prisma_migrations", "_celeriflow_sql_state", "_celeriflow_sql_migrations"]);
const sequenceFields = ["schemaname", "sequencename", "data_type", "start_value", "min_value", "max_value", "increment_by", "cycle", "cache_size"];

function normalizeCatalog(catalog) {
  return Object.fromEntries(Object.keys(queries).map(kind => {
    if (!Array.isArray(catalog[kind])) throw new Error(`Baseline catalog missing group: ${kind}`);
    const rows = catalog[kind].filter(row => {
      const schema = row.schema ?? row.schemaname;
      const name = row.table_name ?? row.tablename ?? row.name;
      return !(schema === "public" && managedNames.has(name)) && !(kind === "constraints" && row.type === "n");
    }).map(row => {
      const selected = kind === "sequences" ? Object.fromEntries(sequenceFields.map(field => [field, row[field]])) : row;
      return Object.fromEntries(Object.entries(selected).map(([key, value]) => [key, typeof value === "string" ? value.replaceAll("\r\n", "\n") : value]));
    }).sort((a, b) => stableJson(a).localeCompare(stableJson(b), "en"));
    return [kind, rows];
  }));
}

export function loadBaselineCatalog(path, expectedSha256) {
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 ?? "")) throw new Error("--catalog-sha256 must be the reviewed catalog file SHA-256");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedSha256) throw new Error("Baseline catalog file SHA-256 mismatch");
  const document = JSON.parse(bytes);
  const catalog = normalizeCatalog(document.catalog);
  return { catalog, fileSha256: expectedSha256, digest: sha256(stableJson(catalog)) };
}

export async function captureMigrationCatalog(connection) {
  const catalog = {};
  for (const [name, query] of Object.entries(queries)) catalog[name] = (await connection.query(query)).rows;
  return catalog;
}

export async function compareMigrationCatalog(connection, baseline) {
  const actual = normalizeCatalog(await captureMigrationCatalog(connection));
  const expected = normalizeCatalog(baseline.catalog);
  const differences = [];
  const counts = {};
  for (const kind of Object.keys(queries)) {
    counts[kind] = { expected: expected[kind].length, actual: actual[kind].length };
    if (stableJson(actual[kind]) !== stableJson(expected[kind])) differences.push(kind);
  }
  return { differences, counts, digest: sha256(stableJson(actual)) };
}
