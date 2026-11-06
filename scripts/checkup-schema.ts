import { config } from "dotenv";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const expected = new Map<string, { columns: string[]; files: string[] }>();
  for (const file of readdirSync("src/db/schema").filter(file => file.endsWith(".ts"))) {
    const definitions = await import(pathToFileURL(resolve("src/db/schema", file)).href);
    for (const value of Object.values(definitions)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      const key = `${table.schema ?? "public"}.${table.name}`;
      const entry = expected.get(key) ?? { columns: [], files: [] };
      entry.columns = [...new Set([...entry.columns, ...table.columns.map(column => column.name)])];
      if (!entry.files.includes(file)) entry.files.push(file);
      expected.set(key, entry);
    }
  }
  // This guard is intentionally queried as raw SQL by the functional login.
  expected.set("public.EmployeePortalLoginGuard", { columns: ["userId", "lockedUntil"], files: ["src/lib/portal-servidor/credential-guard.ts"] });
  const { pool } = openCrossDomainDatabase();
  try {
    const client = await pool.connect();
    let rows: { table_schema: string; table_name: string; column_name: string }[];
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '30s'");
      rows = (await client.query<{ table_schema: string; table_name: string; column_name: string }>("SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'")).rows;
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const columns = actual.get(key) ?? new Set<string>();
      columns.add(row.column_name); actual.set(key, columns);
    }
    const missingTables: { table: string; files: string[] }[] = [];
    const missingColumns: { table: string; columns: string[]; files: string[] }[] = [];
    for (const [table, entry] of expected) {
      if (!actual.has(table)) missingTables.push({ table, files: entry.files });
      else {
        const missing = entry.columns.filter(column => !actual.get(table)!.has(column));
        if (missing.length) missingColumns.push({ table, columns: missing, files: entry.files });
      }
    }
    const report = { date: new Date().toISOString(), scope: "Physical table/column presence only; read-only metadata transaction. Does not validate data, constraints or external integrations.", expectedTables: expected.size, physicalTables: actual.size, missingTables, missingColumns };
    mkdirSync("docs/checkup", { recursive: true });
    writeFileSync("docs/checkup/schema.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na inspeção do schema."); process.exitCode = 1; });
