import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
if (process.argv.includes("--temporal") && process.argv.includes("--consignments")) throw new Error("Selecione apenas uma migration RH por execução.");
const name = process.argv.includes("--consignments") ? "20261011160000_hr_consignment_schedule" : process.argv.includes("--temporal") ? "20261011130000_hr_contract_temporal_revisions" : "20261011030000_hr_workforce_foundation";

async function main() {
  const client = await pool.connect();
  try {
    const apply = process.argv.includes("--apply");
    const sql = readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('RH_MIGRATIONS_DEPLOY'))");
    const requiredTables = ["Employee", "Payroll", "PayrollItem", "HrEmploymentRegime", "HrPayrollRuleSet", "SstBenefitPayrollScope", "SstBenefitPayrollOrigin", "SstLeavePayrollOrigin"];
    if (process.argv.includes("--temporal")) requiredTables.push("HrEmploymentRevision");
    if (process.argv.includes("--consignments")) requiredTables.push("HrEmploymentContract", "HrEmploymentRevision", "HrPayrollRun", "HrMovement", "Supplier");
    const missing: string[] = [];
    for (const table of requiredTables) {
      const result = await client.query('SELECT to_regclass($1) AS relation', [`"${table}"`]);
      if (!result.rows[0].relation) missing.push(table);
    }
    const requiredColumns = [["PayrollItem", "valueDecimal"], ["Payroll", "totalValueDecimal"]];
    if (process.argv.includes("--consignments")) requiredColumns.push(["HrEmploymentRevision", "effectiveFrom"]);
    for (const [table, column] of requiredColumns) {
      const result = await client.query('SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2', [table, column]);
      if (!result.rowCount) missing.push(`${table}.${column}`);
    }
    const { rows } = await client.query('SELECT checksum,finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1 ORDER BY started_at DESC', [name]);
    if (rows.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error("Migração RH incompleta: revisar antes de repetir.");
    const existing = rows.find(row => row.finished_at && !row.rolled_back_at);
    if (existing && existing.checksum !== checksum) throw new Error("Checksum RH divergente.");
    if (apply && missing.length) throw new Error(`Dependências de integração ainda não implantadas: ${missing.join(", ")}. O script não aplica migrations de SST.`);
    let state = existing ? "APPLIED_CHECKSUM_VERIFIED" : "PENDING";
    if (apply && !existing) {
      await client.query(sql);
      await client.query('INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)', [randomUUID(), checksum, name]);
      state = "APPLIED";
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(JSON.stringify({ mode: apply ? "RH_ONLY_DEPLOY" : "PREVIEW", migration: name, state, missingRuntimeDependencies: missing }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error && /^(Migração|Checksum|Dependências)/.test(error.message) ? error.message : "Não foi possível verificar/aplicar a migration de RH."); process.exitCode = 1; });
