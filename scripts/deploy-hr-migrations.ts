import { inspectTaxFinalMigrationAuthority, withTaxFinalMigrationInspection, type MigrationInspectionConnection, type MigrationInspectionSet, type MigrationInspectionTimeouts } from "../src/db/repositories/tax-final-helpers/migration-inspection";

export function hrMigrationSelection(arguments_: readonly string[]) {
  if (arguments_.some(flag => !["--apply", "--preview", "--temporal", "--consignments"].includes(flag))) throw new Error("Opção RH desconhecida.");
  if (arguments_.includes("--apply") && arguments_.includes("--preview")) throw new Error("Selecione preview ou --apply.");
  if (arguments_.includes("--temporal") && arguments_.includes("--consignments")) throw new Error("Selecione apenas uma migration RH por execução.");
  return arguments_.includes("--consignments") ? "20261011160000_hr_consignment_schedule" : arguments_.includes("--temporal") ? "20261011130000_hr_contract_temporal_revisions" : "20261011030000_hr_workforce_foundation";
}

export async function inspectHrMigrations(connection: MigrationInspectionConnection, set: MigrationInspectionSet, arguments_: readonly string[] = [], timeouts: MigrationInspectionTimeouts = {}) {
  const name = hrMigrationSelection(arguments_), apply = arguments_.includes("--apply");
  const inspection = await inspectTaxFinalMigrationAuthority(connection, set, [name], false, timeouts);
  const requiredTables = ["Employee", "Payroll", "PayrollItem", "HrEmploymentRegime", "HrPayrollRuleSet", "SstBenefitPayrollScope", "SstBenefitPayrollOrigin", "SstLeavePayrollOrigin"];
  if (arguments_.includes("--temporal")) requiredTables.push("HrEmploymentRevision");
  if (arguments_.includes("--consignments")) requiredTables.push("HrEmploymentContract", "HrEmploymentRevision", "HrPayrollRun", "HrMovement", "Supplier");
  const missing: string[] = [];
  for (const table of requiredTables) {
    const result = await connection.query('SELECT to_regclass($1) AS relation', [`public."${table}"`]);
    if (!result.rows[0]?.relation) missing.push(table);
  }
  const requiredColumns = [["PayrollItem", "valueDecimal"], ["Payroll", "totalValueDecimal"]];
  if (arguments_.includes("--consignments")) requiredColumns.push(["HrEmploymentRevision", "effectiveFrom"]);
  for (const [table, column] of requiredColumns) {
    const result = await connection.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2", [table, column]);
    if (!result.rowCount) missing.push(`${table}.${column}`);
  }
  if (apply && missing.length) throw new Error(`Dependências de integração ainda não implantadas: ${missing.join(", ")}. O script não aplica migrations de SST; use o fluxo explícito da autoridade SQL.`);
  const final = apply ? await inspectTaxFinalMigrationAuthority(connection, set, [name], true, timeouts) : inspection;
  return { mode: apply ? "RH_ONLY_DEPLOY" : "PREVIEW", migration: name, state: final.migrations[0].state, missingRuntimeDependencies: missing, ...final };
}

async function main() {
  const arguments_ = process.argv.slice(2);
  hrMigrationSelection(arguments_);
  console.log(JSON.stringify(await withTaxFinalMigrationInspection(arguments_.includes("--apply"), (connection, set, timeouts) => inspectHrMigrations(connection, set, arguments_, timeouts)), null, 2));
}
if (process.argv[1] && /(?:^|[\\/])deploy-hr-migrations\.ts$/.test(process.argv[1])) {
  main().catch(error => { console.error(error instanceof Error && /^(Migration|Migração|SQL pendente|Autoridade|Dependências|Selecione|Opção|DATABASE_|Invalid migration|Vercel)/.test(error.message) ? error.message : "Não foi possível inspecionar a autoridade SQL de RH."); process.exitCode = 1; });
}
