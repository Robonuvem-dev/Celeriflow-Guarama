import { inspectTaxFinalMigrationAuthority, withTaxFinalMigrationInspection, type MigrationInspectionConnection, type MigrationInspectionSet, type MigrationInspectionTimeouts } from "../src/db/repositories/tax-final-helpers/migration-inspection";

const names = ["20261011010000_cemetery_integrity", "20261011020000_cemetery_automatic_fees"];
export async function inspectCemeteryMigrations(connection: MigrationInspectionConnection, set: MigrationInspectionSet, apply = false, timeouts: MigrationInspectionTimeouts = {}) {
  return { mode: apply ? "CEMETERY_ONLY_DEPLOY" : "PREVIEW", ...await inspectTaxFinalMigrationAuthority(connection, set, names, apply, timeouts) };
}
async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some(flag => !["--apply", "--preview"].includes(flag)) || (arguments_.includes("--apply") && arguments_.includes("--preview"))) throw new Error("Selecione preview ou --apply; opção de Cemitérios inválida.");
  console.log(JSON.stringify(await withTaxFinalMigrationInspection(arguments_.includes("--apply"), (connection, set, timeouts) => inspectCemeteryMigrations(connection, set, arguments_.includes("--apply"), timeouts)), null, 2));
}
if (process.argv[1] && /(?:^|[\\/])deploy-cemetery-migrations\.ts$/.test(process.argv[1])) {
  main().catch(error => { console.error(error instanceof Error && /^(Migration|SQL pendente|Autoridade|Selecione|DATABASE_|Invalid migration|Vercel)/.test(error.message) ? error.message : "Não foi possível inspecionar a autoridade SQL de Cemitérios."); process.exitCode = 1; });
}
