/** Read-only census. Findings are reviewed individually before any correction. */
import { config } from "dotenv";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { setTimeout as delay } from "node:timers/promises";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
const output = process.env.CHECKUP_AUDIT_OUTPUT || "docs/checkup/demonstration-data";
const primaryFields = new Set(["name", "nome", "fullName", "corporateName", "tradeName", "title", "titulo", "registration", "municipalInsc", "ibgeCode", "email", "code", "codigo", "number", "numero", "object", "description", "descricao", "purpose"]);
const primaryLabels = new Set(["name", "nome", "fullName", "corporateName", "tradeName", "title", "titulo", "object"]);
const marker = "(^|[^[:alnum:]])(demo[0-9]{0,4}|poc|teste|test|exemplo|dummy|placeholder)([^[:alnum:]]|$)";
type Table = { table: string; columns: string[]; hasId: boolean };
type Finding = { table: string; column: string; category: string; matches: number; samples: { id: string | null; value: string }[] };
const report = { startedAt: new Date().toISOString(), mode: "READ_ONLY", tables: [] as { table: string; rows: number }[], findings: [] as Finding[], errors: [] as { table: string; message: string }[], finishedAt: undefined as string | undefined };
mkdirSync(output, { recursive: true });
let lastCheckpoint = 0;
const persist = (force = false) => {
  if (!force && Date.now() - lastCheckpoint < 3000) return false;
  const temporary = `${output}/audit.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n");
    renameSync(temporary, `${output}/audit.json`);
    lastCheckpoint = Date.now();
    return true;
  } catch (error) {
    if (!["EPERM", "EBUSY", "EACCES", "UNKNOWN"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
    return false;
  }
};
async function main() {
try {
  const metadata = await connection.db.execute<Table>(sql`SELECT c.table_name AS "table", array_agg(c.column_name::text ORDER BY c.ordinal_position) AS columns, bool_or(c.column_name='id') AS "hasId" FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' GROUP BY c.table_name ORDER BY c.table_name`);
  const tables = metadata.rows.filter(row => !row.table.startsWith("_") && row.table !== "schema_migrations");
  for (let offset = 0; offset < tables.length; offset += 30) {
    const batch = tables.slice(offset, offset + 30);
    const counts = await connection.db.execute<{ table: string; rows: number }>(sql.join(batch.map(row => sql`SELECT ${row.table}::text AS "table", count(*)::integer AS rows FROM ${sql.identifier(row.table)}`), sql` UNION ALL `));
    report.tables.push(...counts.rows);
    persist();
  }
  const populated = tables.filter(row => report.tables.some(count => count.table === row.table && count.rows > 0));
  let cursor = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < populated.length) {
      const table = populated[cursor++];
      const columns = table.columns.filter(column => primaryFields.has(column));
      if (!columns.length) continue;
      try {
        // Values are read only from explicitly listed presentation fields; no credentials or payload JSON.
        const textColumns = await connection.db.execute<{ column: string }>(sql`SELECT column_name AS "column" FROM information_schema.columns WHERE table_schema='public' AND table_name=${table.table} AND data_type IN ('text','character varying','character') AND column_name IN (${sql.join(columns.map(column => sql`${column}`), sql`, `)})`);
        const fields = textColumns.rows.map(row => row.column);
        if (!fields.length) continue;
        const counts = await connection.db.execute<{ column: string; matches: number }>(sql.join(fields.map(column => sql`SELECT ${column}::text AS "column", count(*)::integer AS matches FROM ${sql.identifier(table.table)} WHERE ${sql.identifier(column)} ~* ${marker}`), sql` UNION ALL `));
        for (const row of counts.rows.filter(row => row.matches > 0)) {
          const samples = await connection.db.execute<{ id: string | null; value: string }>(sql`SELECT ${table.hasId ? sql`id::text` : sql`NULL::text`} AS id, left(${sql.identifier(row.column)},240) AS value FROM ${sql.identifier(table.table)} WHERE ${sql.identifier(row.column)} ~* ${marker} ORDER BY ${table.hasId ? sql`id` : sql.identifier(row.column)} LIMIT 8`);
          report.findings.push({ table: table.table, column: row.column, category: primaryLabels.has(row.column) ? "PRIMARY_LABEL" : /code|codigo|registration|municipalInsc|number|numero/.test(row.column) ? "DISPLAY_IDENTIFIER" : "CONTEXT_OR_PROVENANCE_REVIEW", matches: row.matches, samples: samples.rows });
        }
      } catch (error) { report.errors.push({ table: table.table, message: error instanceof Error ? error.message : String(error) }); }
      persist();
    }
  }));
  report.finishedAt = new Date().toISOString();
  let persisted = false;
  for (let attempt = 0; attempt < 10 && !persisted; attempt++) {
    persisted = persist(true);
    if (!persisted) await delay(150);
  }
  if (!persisted) throw new Error(`Checkpoint final bloqueado; snapshot retido em ${output}/audit.${process.pid}.tmp`);
  writeFileSync(`${output}/AUDIT.md`, `# Qualidade dos dados de apresentação\n\nCenso READ ONLY concluído em ${report.finishedAt}.\n\n${report.tables.length} tabelas físicas; ${report.tables.filter(row => row.rows === 0).length} vazias. Tabela física vazia não significa automaticamente tela sem demonstração: filtros, status, permissões e fontes derivadas exigem conferência.\n\n## Rótulos e identificadores a revisar\n\n| Tabela | Campo | Categoria | Ocorrências |\n| --- | --- | --- | --- |\n` + report.findings.map(row => `| ${row.table} | ${row.column} | ${row.category} | ${row.matches} |`).join("\n") + "\n\n## Tabelas físicas vazias\n\n" + report.tables.filter(row => row.rows === 0).map(row => `- \`${row.table}\``).join("\n") + "\n");
  console.log(JSON.stringify({ tables: report.tables.length, emptyTables: report.tables.filter(row => row.rows === 0).length, primaryLabelFindings: report.findings.filter(row => row.category === "PRIMARY_LABEL"), errors: report.errors }, null, 2));
} finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
