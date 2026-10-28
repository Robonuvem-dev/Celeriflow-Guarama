import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import type { DatabaseExecutor } from "../src/db/transaction";
import { identifier, openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";

const scopeMigrations = ["20261012100000_accounting_entity_unit_scope", "20261012110000_entity_scoped_financial_years", "20261012120000_accounting_year_entity_guard", "20261012130000_scoped_year_requires_accounting_scope", "20261012140000_revenue_budget_unit_scope", "20261012150000_accounting_year_scope_update_guard", "20261012160000_internal_control_budget_scope"];
type MigrationReceipt = { migration_name: string; finished: boolean; rolledBack: boolean };
type Count = string | number | bigint;

async function readScopeMigrations(db: DatabaseExecutor): Promise<MigrationReceipt[]> {
  const [ledgers] = await queryRows<{ legacy: boolean; state: boolean; receipts: boolean }>(db, sql`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS legacy,to_regclass('public._celeriflow_sql_state') IS NOT NULL AS state,to_regclass('public._celeriflow_sql_migrations') IS NOT NULL AS receipts`);
  if (ledgers.legacy) return queryRows<MigrationReceipt>(db, sql`SELECT DISTINCT ON (migration_name) migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM public."_prisma_migrations" WHERE migration_name=ANY(${sql.param(scopeMigrations)}::text[]) ORDER BY migration_name, started_at DESC`);
  if (!ledgers.state || !ledgers.receipts) return [];
  // A fresh replay records real execution, without manufacturing a legacy
  // ledger. An adopted database still requires its preserved installed ledger.
  const [state] = await queryRows<{ valid: boolean }>(db, sql`SELECT count(*)=1 AND bool_and(singleton=true AND format_version=1 AND authority='celeriflow-explicit-sql-v1' AND origin='replayed') AS valid FROM public._celeriflow_sql_state`);
  if (!state.valid) return [];
  return queryRows<MigrationReceipt>(db, sql`SELECT name AS migration_name,(origin='executed' AND legacy_row IS NULL) AS finished,false AS "rolledBack" FROM public._celeriflow_sql_migrations WHERE name=ANY(${sql.param(scopeMigrations)}::text[]) ORDER BY name`);
}

export async function readP1ScopeReport(db: DatabaseExecutor) {
    const migrations = await readScopeMigrations(db);
    const allMigrationsApplied = migrations.length === 7 && migrations.every((migration) => migration.finished && !migration.rolledBack);
    const [columns] = await queryRows<{ entity: boolean; unit: boolean }>(db, sql`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='AccountingTransaction' AND column_name='governmentEntityId') AS entity, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='AccountingTransaction' AND column_name='budgetUnitId') AS unit`);
    const [guard] = await queryRows<{ present: boolean }>(db, sql`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='AccountingTransaction_scope_guard' AND NOT tgisinternal) AS present`);
    const [ledger] = await queryRows<{ total: Count; scoped: Count; unscoped: Count; mismatched: Count }>(db, sql`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE t."governmentEntityId" IS NOT NULL AND t."budgetUnitId" IS NOT NULL) AS scoped,
        count(*) FILTER (WHERE t."governmentEntityId" IS NULL AND t."budgetUnitId" IS NULL) AS unscoped,
        count(*) FILTER (WHERE t."governmentEntityId" IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM "PlanningEntityUnit" u WHERE u."governmentEntityId"=t."governmentEntityId" AND u."budgetUnitId"=t."budgetUnitId"
        )) AS mismatched
      FROM "AccountingTransaction" t`);
    const [p0] = await queryRows<{ entities: Count; units: Count; years: Count; instruments: Count }>(db, sql`
      SELECT
        (SELECT count(*) FROM "GovernmentEntity" WHERE id LIKE 'p0-current-%') AS entities,
        (SELECT count(*) FROM "BudgetUnit" WHERE id LIKE 'p0-current-%') AS units,
        (SELECT count(*) FROM "FinancialYear" WHERE id LIKE 'p0-current-year-%' OR "governmentEntityId" IN ('p0-current-exe','p0-current-leg')) AS years,
        (SELECT count(*) FROM "PlanningInstrument" WHERE id LIKE 'p0-current-%') AS instruments`);
    const [yearUniqueness] = await queryRows<{ scopedYearKey: boolean; legacyYearKey: boolean }>(db, sql`SELECT
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='FinancialYear_governmentEntityId_year_key') AS "scopedYearKey",
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='FinancialYear_legacy_year_key') AS "legacyYearKey"`);
    const financialYearIndexes = await queryRows<{ indexname: string; indexdef: string }>(db, sql`SELECT indexname::text,indexdef::text FROM pg_indexes WHERE schemaname=current_schema() AND tablename='FinancialYear' ORDER BY indexname`);
    const [revenueScope] = await queryRows<{ total: Count; unscoped: Count; mismatched: Count }>(db, sql`SELECT count(*) AS total, count(*) FILTER (WHERE r."budgetUnitId" IS NULL) AS unscoped,
      count(*) FILTER (WHERE y."governmentEntityId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PlanningEntityUnit" u WHERE u."budgetUnitId"=r."budgetUnitId" AND u."governmentEntityId"=y."governmentEntityId")) AS mismatched
      FROM "Revenue" r LEFT JOIN "FinancialYear" y ON y.id=r."financialYearId"`);
    const [catalogs] = await queryRows<{ versions: Count; entries: Count; sourcesWithoutYear: Count; revenueNaturesWithoutYear: Count; expenseNaturesWithoutVersion: Count }>(db, sql`SELECT
      (SELECT count(*) FROM "PlanningCatalogVersion") AS versions,
      (SELECT count(*) FROM "PlanningCatalogEntry") AS entries,
      (SELECT count(*) FROM "ResourceSource" WHERE "referenceYear" IS NULL) AS "sourcesWithoutYear",
      (SELECT count(*) FROM "RevenueNature" WHERE "referenceYear" IS NULL) AS "revenueNaturesWithoutYear",
      (SELECT count(*) FROM "ExpenseNature" e WHERE NOT EXISTS (SELECT 1 FROM "PlanningCatalogEntry" c WHERE c.kind='EXPENSE' AND c."canonicalId"=e.id)) AS "expenseNaturesWithoutVersion"`);
    const identity = [];
    for (const model of ["Taxpayer", "Supplier", "Creditor"]) {
      const [counts] = await queryRows<{ total: Count; missing: Count; ambiguous: Count }>(db, sql`SELECT count(*) AS total, count(*) FILTER (WHERE "personId" IS NULL AND "companyId" IS NULL) AS missing, count(*) FILTER (WHERE "personId" IS NOT NULL AND "companyId" IS NOT NULL) AS ambiguous FROM ${identifier(model)}`);
      identity.push({ model, total: Number(counts.total), missing: Number(counts.missing), ambiguous: Number(counts.ambiguous) });
    }
    const decimals = [];
    for (const model of ["AccountingEntry", "Revenue", "Commitment", "Settlement", "Payment"]) {
      const [counts] = await queryRows<{ total: Count; missing: Count; mismatched: Count }>(db, sql`SELECT count(*) AS total, count(*) FILTER (WHERE "valueDecimal" IS NULL) AS missing, count(*) FILTER (WHERE "valueDecimal" IS NOT NULL AND round("value"::numeric, 2) IS DISTINCT FROM "valueDecimal") AS mismatched FROM ${identifier(model)}`);
      decimals.push({ model, total: Number(counts.total), missing: Number(counts.missing), mismatched: Number(counts.mismatched) });
    }
    return {
      mode: "READ_ONLY",
      migrations,
      migrationsApplied: allMigrationsApplied,
      columns,
      entityUnitTrigger: guard.present,
      ledger: { total: Number(ledger.total), scoped: Number(ledger.scoped), unscoped: Number(ledger.unscoped), mismatched: Number(ledger.mismatched) },
      p0Fixtures: { entities: Number(p0.entities), units: Number(p0.units), years: Number(p0.years), instruments: Number(p0.instruments) },
      financialYearKeys: yearUniqueness,
      financialYearIndexes,
      revenueScope: { total: Number(revenueScope.total), unscoped: Number(revenueScope.unscoped), mismatched: Number(revenueScope.mismatched) },
      catalogReadiness: { versions: Number(catalogs.versions), entries: Number(catalogs.entries), sourcesWithoutYear: Number(catalogs.sourcesWithoutYear), revenueNaturesWithoutYear: Number(catalogs.revenueNaturesWithoutYear), expenseNaturesWithoutVersion: Number(catalogs.expenseNaturesWithoutVersion) },
      identity,
      decimals,
      scopeConclusion: "Verifica fundação de escopo; não certifica homologação de catálogos nem o aceite integral da P1.",
      preservation: "SELECT-only; no rows updated or inserted",
    };
}

export function p1ScopeHasRequiredFoundation(result: Awaited<ReturnType<typeof readP1ScopeReport>>): boolean {
  return result.migrationsApplied && result.columns.entity && result.columns.unit && result.entityUnitTrigger && result.ledger.mismatched === 0 && result.p0Fixtures.entities === 2 && result.p0Fixtures.units === 42 && result.p0Fixtures.years === 12 && result.p0Fixtures.instruments === 18 && result.financialYearKeys.scopedYearKey && result.financialYearKeys.legacyYearKey;
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const connection = openCrossDomainDatabase(2_000);
  try {
    const result = await readP1ScopeReport(connection.db);
    console.log(JSON.stringify(result, null, 2));
    if (process.argv.includes("--write-evidence")) writeFileSync("docs/poc-p0/VERIFICACAO_P1.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
    if (!p1ScopeHasRequiredFoundation(result)) process.exitCode = 1;
  } finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/verify-poc-p1-scope.ts")) {
  void main().catch((error: unknown) => { console.error("Verificação P1 falhou:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[URL omitida]") : "ERRO"); process.exitCode = 1; });
}
