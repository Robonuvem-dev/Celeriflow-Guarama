import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9);
if (!output) throw new Error("Informe --output=diretório para preservar os levantamentos anteriores.");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada.");
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 30_000 });
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const literal = value => `'${value.replaceAll("'", "''")}'`;
const baseline = JSON.parse(readFileSync("docs/checkup/neon-empty-tables-2026-11-08/report.json", "utf8"));
const report = { startedAt: new Date().toISOString(), mode: "REPEATABLE READ READ ONLY", tables: [], errors: [] };
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SET LOCAL row_security = off");
  report.snapshot = (await client.query("SELECT current_database() AS database, now() AS at")).rows[0];
  const tables = (await client.query(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname<>'information_schema' AND n.nspname!~'^pg_' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY 1,2`)).rows;
  const count = table => `SELECT ${literal(table.schema)}::text AS schema,${literal(table.name)}::text AS name,count(*)::text AS rows FROM ${identifier(table.schema)}.${identifier(table.name)}`;
  for (let index = 0; index < tables.length; index += 25) {
    await client.query("SAVEPOINT census_batch");
    const batch = tables.slice(index, index + 25);
    try { report.tables.push(...(await client.query(batch.map(count).join(" UNION ALL "))).rows); }
    catch {
      await client.query("ROLLBACK TO SAVEPOINT census_batch");
      for (const table of batch) {
        await client.query("SAVEPOINT census_table");
        try { report.tables.push(...(await client.query(count(table))).rows); }
        catch (error) { await client.query("ROLLBACK TO SAVEPOINT census_table"); report.errors.push({ ...table, code: error.code }); }
        await client.query("RELEASE SAVEPOINT census_table");
      }
    }
    await client.query("RELEASE SAVEPOINT census_batch");
  }
  await client.query("ROLLBACK");
  report.tables = report.tables.map(table => {
    const previous = baseline.tables.find(item => item.schema === table.schema && item.name === table.name);
    return { ...table, rows: Number(table.rows), initialRows: previous?.rows ?? null, delta: previous ? Number(table.rows) - previous.rows : null };
  });
  report.summary = { tables: tables.length, checked: report.tables.length, empty: report.tables.filter(table => !table.rows).length, populated: report.tables.filter(table => table.rows > 0).length, records: report.tables.reduce((sum, table) => sum + table.rows, 0), previouslyEmptyNowPopulated: report.tables.filter(table => table.initialRows === 0 && table.rows > 0).length, errors: report.errors.length };
  report.finishedAt = new Date().toISOString();
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "census.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(output, "census.csv"), "schema,table,initialRows,rows,delta\n" + report.tables.map(table => [table.schema, table.name, table.initialRows, table.rows, table.delta].join(",")).join("\n") + "\n");
  console.log(JSON.stringify({ output, ...report.summary }, null, 2));
  if (report.errors.length) process.exitCode = 1;
} finally { client.release(); await pool.end(); }
