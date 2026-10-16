import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const migrations = await prisma.$queryRaw<{ migration_name: string; finished: boolean; rolledBack: boolean }[]>`SELECT DISTINCT ON (migration_name) migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations" WHERE migration_name IN ('20261012100000_accounting_entity_unit_scope','20261012110000_entity_scoped_financial_years','20261012120000_accounting_year_entity_guard','20261012130000_scoped_year_requires_accounting_scope','20261012140000_revenue_budget_unit_scope','20261012150000_accounting_year_scope_update_guard','20261012160000_internal_control_budget_scope') ORDER BY migration_name, started_at DESC`;
    const allMigrationsApplied = migrations.length === 7 && migrations.every((migration) => migration.finished && !migration.rolledBack);
    const [columns] = await prisma.$queryRaw<{ entity: boolean; unit: boolean }[]>`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='AccountingTransaction' AND column_name='governmentEntityId') AS entity, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='AccountingTransaction' AND column_name='budgetUnitId') AS unit`;
    const [guard] = await prisma.$queryRaw<{ present: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='AccountingTransaction_scope_guard' AND NOT tgisinternal) AS present`;
    const [ledger] = await prisma.$queryRaw<{ total: bigint; scoped: bigint; unscoped: bigint; mismatched: bigint }[]>`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE t."governmentEntityId" IS NOT NULL AND t."budgetUnitId" IS NOT NULL) AS scoped,
        count(*) FILTER (WHERE t."governmentEntityId" IS NULL AND t."budgetUnitId" IS NULL) AS unscoped,
        count(*) FILTER (WHERE t."governmentEntityId" IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM "PlanningEntityUnit" u WHERE u."governmentEntityId"=t."governmentEntityId" AND u."budgetUnitId"=t."budgetUnitId"
        )) AS mismatched
      FROM "AccountingTransaction" t`;
    const [p0] = await prisma.$queryRaw<{ entities: bigint; units: bigint; years: bigint; instruments: bigint }[]>`
      SELECT
        (SELECT count(*) FROM "GovernmentEntity" WHERE id LIKE 'p0-current-%') AS entities,
        (SELECT count(*) FROM "BudgetUnit" WHERE id LIKE 'p0-current-%') AS units,
        (SELECT count(*) FROM "FinancialYear" WHERE id LIKE 'p0-current-year-%' OR "governmentEntityId" IN ('p0-current-exe','p0-current-leg')) AS years,
        (SELECT count(*) FROM "PlanningInstrument" WHERE id LIKE 'p0-current-%') AS instruments`;
    const [yearUniqueness] = await prisma.$queryRaw<{ scopedYearKey: boolean; legacyYearKey: boolean }[]>`SELECT
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='FinancialYear_governmentEntityId_year_key') AS "scopedYearKey",
      EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='FinancialYear_legacy_year_key') AS "legacyYearKey"`;
    const financialYearIndexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`SELECT indexname::text,indexdef::text FROM pg_indexes WHERE schemaname=current_schema() AND tablename='FinancialYear' ORDER BY indexname`;
    const [revenueScope] = await prisma.$queryRaw<{ total: bigint; unscoped: bigint; mismatched: bigint }[]>`SELECT count(*) AS total, count(*) FILTER (WHERE r."budgetUnitId" IS NULL) AS unscoped,
      count(*) FILTER (WHERE y."governmentEntityId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "PlanningEntityUnit" u WHERE u."budgetUnitId"=r."budgetUnitId" AND u."governmentEntityId"=y."governmentEntityId")) AS mismatched
      FROM "Revenue" r LEFT JOIN "FinancialYear" y ON y.id=r."financialYearId"`;
    const [catalogs] = await prisma.$queryRaw<{ versions: bigint; entries: bigint; sourcesWithoutYear: bigint; revenueNaturesWithoutYear: bigint; expenseNaturesWithoutVersion: bigint }[]>`SELECT
      (SELECT count(*) FROM "PlanningCatalogVersion") AS versions,
      (SELECT count(*) FROM "PlanningCatalogEntry") AS entries,
      (SELECT count(*) FROM "ResourceSource" WHERE "referenceYear" IS NULL) AS "sourcesWithoutYear",
      (SELECT count(*) FROM "RevenueNature" WHERE "referenceYear" IS NULL) AS "revenueNaturesWithoutYear",
      (SELECT count(*) FROM "ExpenseNature" e WHERE NOT EXISTS (SELECT 1 FROM "PlanningCatalogEntry" c WHERE c.kind='EXPENSE' AND c."canonicalId"=e.id)) AS "expenseNaturesWithoutVersion"`;
    const identity = [];
    for (const model of ["Taxpayer", "Supplier", "Creditor"]) {
      const [counts] = await prisma.$queryRaw<{ total: bigint; missing: bigint; ambiguous: bigint }[]>(Prisma.sql`SELECT count(*) AS total, count(*) FILTER (WHERE "personId" IS NULL AND "companyId" IS NULL) AS missing, count(*) FILTER (WHERE "personId" IS NOT NULL AND "companyId" IS NOT NULL) AS ambiguous FROM ${Prisma.raw(`"${model}"`)}`);
      identity.push({ model, ...Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])) });
    }
    const decimals = [];
    for (const model of ["AccountingEntry", "Revenue", "Commitment", "Settlement", "Payment"]) {
      const [counts] = await prisma.$queryRaw<{ total: bigint; missing: bigint; mismatched: bigint }[]>(Prisma.sql`SELECT count(*) AS total, count(*) FILTER (WHERE "valueDecimal" IS NULL) AS missing, count(*) FILTER (WHERE "valueDecimal" IS NOT NULL AND round("value"::numeric, 2) IS DISTINCT FROM "valueDecimal") AS mismatched FROM ${Prisma.raw(`"${model}"`)}`);
      decimals.push({ model, ...Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])) });
    }
    const result = {
      mode: "READ_ONLY",
      migrations,
      migrationsApplied: allMigrationsApplied,
      columns,
      entityUnitTrigger: guard.present,
      ledger: Object.fromEntries(Object.entries(ledger).map(([key, value]) => [key, Number(value)])),
      p0Fixtures: Object.fromEntries(Object.entries(p0).map(([key, value]) => [key, Number(value)])),
      financialYearKeys: yearUniqueness,
      financialYearIndexes,
      revenueScope: Object.fromEntries(Object.entries(revenueScope).map(([key, value]) => [key, Number(value)])),
      catalogReadiness: Object.fromEntries(Object.entries(catalogs).map(([key, value]) => [key, Number(value)])),
      identity,
      decimals,
      scopeConclusion: "Verifica fundação de escopo; não certifica homologação de catálogos nem o aceite integral da P1.",
      preservation: "SELECT-only; no rows updated or inserted",
    };
    console.log(JSON.stringify(result, null, 2));
    if (process.argv.includes("--write-evidence")) writeFileSync("docs/poc-p0/VERIFICACAO_P1.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
    if (!allMigrationsApplied || !columns.entity || !columns.unit || !guard.present || result.ledger.mismatched !== 0 || result.p0Fixtures.entities !== 2 || result.p0Fixtures.units !== 42 || result.p0Fixtures.years !== 12 || result.p0Fixtures.instruments !== 18 || !yearUniqueness.scopedYearKey || !yearUniqueness.legacyYearKey) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error("Verificação P1 falhou:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[URL omitida]") : "ERRO"); process.exitCode = 1; });
