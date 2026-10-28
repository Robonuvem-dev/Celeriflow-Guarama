import { config } from "dotenv";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/db/transaction";
import { openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";

// Conferência somente de leitura: não cadastra contas, não ativa perfis e não infere saldos.
export async function readMunicipalModuleReadiness(db: DatabaseExecutor) {
  const [[counts], catalogVersions] = await Promise.all([
    queryRows<{ bankAccounts: number; mappings: number; profiles: number; controlPlans: number }>(db, sql`SELECT
      (SELECT count(*)::integer FROM "BankAccount") AS "bankAccounts",
      (SELECT count(*)::integer FROM "TaxFinancialMapping") AS mappings,
      (SELECT count(*)::integer FROM "TaxRegistryEntry" WHERE category=${"ACCOUNTING_PROFILE"} AND status=${"ATIVO"}) AS profiles,
      (SELECT count(*)::integer FROM "InternalControlPlan") AS "controlPlans"`),
    queryRows<{ id: string; status: string }>(db, sql`SELECT id,status FROM "PlanningCatalogVersion" WHERE starts_with(id,${"p1-ibge-cnae-"}) OR starts_with(id,${"p1-mte-cbo-"}) OR id=${"p1-tce-pr-account-2026-1.0d"}`),
  ]);
  const { bankAccounts, mappings, profiles, controlPlans } = counts;
  return { checkedAt: new Date().toISOString(), mode: "READ_ONLY", bankAccounts, taxFinancialMappings: mappings, activeTaxAccountingProfiles: profiles, catalogVersions, controlPlans, operationalDependencies: { bankConfigurationRequired: bankAccounts === 0, taxFinancialMappingRequired: mappings === 0, taxAccountingActivationRequired: profiles === 0 } };
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const connection = openCrossDomainDatabase(2_000);
  try {
    console.log(JSON.stringify(await readMunicipalModuleReadiness(connection.db), null, 2));
  } finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/verify-municipal-module-readiness.ts")) {
  void main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência municipal."); process.exitCode = 1; });
}
