import { config } from "dotenv";
import { Prisma } from "@prisma/client";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
async function main() {
const { prisma } = await import("../src/lib/prisma");

// Read-only operational diagnostics. No credential values, identities or payroll/clinical data are returned.
try {
  const names = ["PlanningInstrument", "PlanningEntityUnit", "PlanningCatalogVersion", "PlanningDocumentLink", "PlanningReportSnapshot", "PlanningReportPublication", "PlanningPublicationEvent"];
  const tables = [];
  for (const name of names) { const [row] = await prisma.$queryRaw<{ present: boolean }[]>`SELECT to_regclass(${`"${name}"`}) IS NOT NULL AS present`; tables.push({ table: name, present: row.present }); }
  const migrations = await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name LIKE '202610112%planning%' ORDER BY migration_name`;
  const expected = ["20261011200000_planning_accounting_command_integrity", "20261011210000_planning_catalog_maintenance", "20261011220000_planning_publication"];
  const missingMigrations = expected.filter((name) => !migrations.some((row) => row.migration_name === name));
  const modules = await prisma.$queryRaw<{ codigo: string; ativo: boolean }[]>`SELECT codigo,ativo FROM "ConfiguracaoModulo" WHERE codigo IN ('PLANEJAMENTO','CAMARA','DOCUMENTOS','TRANSPARENCIA','FINANCEIRO') ORDER BY codigo`;
  const [instruments] = tables.find((row) => row.table === "PlanningInstrument")?.present ? await prisma.$queryRaw<{ total: bigint; implanted: bigint }[]>`SELECT count(*) AS total,count(*) FILTER(WHERE "implantedAt" IS NOT NULL) AS implanted FROM "PlanningInstrument"` : [{ total: 0n, implanted: 0n }];
  const [catalogs] = tables.find((row) => row.table === "PlanningCatalogVersion")?.present ? await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "PlanningCatalogVersion" WHERE status='PUBLISHED'`) : [{ total: 0n }];
  console.log(JSON.stringify({ mode: "READ_ONLY", tables, missingMigrations, modules, instruments: { total: Number(instruments.total), implanted: Number(instruments.implanted) }, publishedCatalogs: Number(catalogs.total), storageConfigured: !!process.env.BLOB_READ_WRITE_TOKEN, browserSessionProvided: false, browserAcceptance: "NOT_EXECUTED_AUTHENTICATED" }, null, 2));
} finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error("Diagnóstico de Planejamento não concluído.", typeof error?.code === "string" ? error.code : "READINESS_ERROR"); process.exitCode = 1; });
