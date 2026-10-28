import { config } from "dotenv";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/db/transaction";
import { openMunicipalSetupConnection } from "./lib/municipal-setup-tools";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
// Read-only operational diagnostics. No credential values, identities or payroll/clinical data are returned.
export async function verifyPlanningReadiness(db: DatabaseExecutor, storageConfigured = !!process.env.BLOB_READ_WRITE_TOKEN) {
  const names = ["PlanningInstrument", "PlanningEntityUnit", "PlanningCatalogVersion", "PlanningDocumentLink", "PlanningReportSnapshot", "PlanningReportPublication", "PlanningPublicationEvent"];
  const tables = [];
  for (const name of names) { const [row] = (await db.execute<{ present: boolean }>(sql`SELECT to_regclass(${`"${name}"`}) IS NOT NULL AS present`)).rows; tables.push({ table: name, present: row.present }); }
  const migrations = (await db.execute<{ migration_name: string }>(sql`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name LIKE '202610112%planning%' ORDER BY migration_name`)).rows;
  const expected = ["20261011200000_planning_accounting_command_integrity", "20261011210000_planning_catalog_maintenance", "20261011220000_planning_publication"];
  const missingMigrations = expected.filter((name) => !migrations.some((row) => row.migration_name === name));
  const modules = (await db.execute<{ codigo: string; ativo: boolean }>(sql`SELECT codigo,ativo FROM "ConfiguracaoModulo" WHERE codigo IN ('PLANEJAMENTO','CAMARA','DOCUMENTOS','TRANSPARENCIA','FINANCEIRO') ORDER BY codigo`)).rows;
  const [instruments] = tables.find((row) => row.table === "PlanningInstrument")?.present ? (await db.execute<{ total: string; implanted: string }>(sql`SELECT count(*) AS total,count(*) FILTER(WHERE "implantedAt" IS NOT NULL) AS implanted FROM "PlanningInstrument"`)).rows : [{ total: '0', implanted: '0' }];
  const [catalogs] = tables.find((row) => row.table === "PlanningCatalogVersion")?.present ? (await db.execute<{ total: string }>(sql`SELECT count(*) AS total FROM "PlanningCatalogVersion" WHERE status='PUBLISHED'`)).rows : [{ total: '0' }];
  return { mode: "READ_ONLY", tables, missingMigrations, modules, instruments: { total: Number(instruments.total), implanted: Number(instruments.implanted) }, publishedCatalogs: Number(catalogs.total), storageConfigured, browserSessionProvided: false, browserAcceptance: "NOT_EXECUTED_AUTHENTICATED" };
}
async function main() {
  const connection = openMunicipalSetupConnection();
  try { console.log(JSON.stringify(await verifyPlanningReadiness(connection.db), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch((error) => { console.error("Diagnóstico de Planejamento não concluído.", typeof error?.code === "string" ? error.code : "READINESS_ERROR"); process.exitCode = 1; });
