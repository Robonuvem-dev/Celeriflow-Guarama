import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accessProfiles, users } from "../src/db/schema/identity";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { mkdirSync, writeFileSync } from "node:fs";
import { seedFoundation, seedAdministration, seedCitizenServices, seedEducationHealthSocial, seedEnvironmentSanitation, seedCultureWorksSecurity, seedLegislative, seedPlanningProcurement, seedStockSstHealth, seedPortal, seedCommunityOperations, systemDataset } from "./municipal-system-dataset";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const modules = { foundation: seedFoundation, administration: seedAdministration, services: seedCitizenServices, educationHealthSocial: seedEducationHealthSocial, environmentSanitation: seedEnvironmentSanitation, cultureWorksSecurity: seedCultureWorksSecurity, legislative: seedLegislative, planningProcurement: seedPlanningProcurement, stockSstHealth: seedStockSstHealth, portal: seedPortal, communityOperations: seedCommunityOperations };
async function main() {
  const apply = process.argv.includes("--apply");
  const selected = process.argv.find(argument => argument.startsWith("--modules="))?.slice(10).split(",") || Object.keys(modules);
  if (selected.some(module => !(module in modules))) throw new Error("Módulo da carga não reconhecido.");
  if (!apply) { console.log(JSON.stringify({ mode: "PREVIEW", dataset: systemDataset, modules: selected, people: 60, companies: 20, preservesExistingRows: true, audit: "transação por conjunto de módulos; IDs determinísticos", source: "Dados de referência plausíveis autorizados pelo responsável" }, null, 2)); return; }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  const { db } = connection;
  try {
    const [actor] = await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1);
    if (!actor) throw new Error("Administrador ativo não encontrado.");
    const results: Array<{ module: string; tables?: Record<string, number>; error?: string }> = [];
    for (const moduleName of selected) {
      try {
        const tables = await withDatabaseTransaction(connection, async tx => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${systemDataset}))`);
          const counts = await modules[moduleName as keyof typeof modules]({ tx, actorId: actor.id });
          if (Object.values(counts).some(count => count > 0)) await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_DATASET_POPULATED", entityType: "DATASET", entityId: `${systemDataset}:${moduleName}`, authorUsuarioId: actor.id, payload: { dataset: systemDataset, fictional: true, tables: counts, mode: "ADDITIVE_ONLY", source: "OWNER_AUTHORIZED_REFERENCE" } });
          return counts;
        }, { timeoutMs: 240_000 });
        results.push({ module: moduleName, tables }); console.log(JSON.stringify({ module: moduleName, tables }));
      } catch (error) { const message = error instanceof Error ? error.message : "Falha na transação"; results.push({ module: moduleName, error: message }); console.error(JSON.stringify({ module: moduleName, error: message })); process.exitCode = 1; if (moduleName === "foundation") break; }
    }
    mkdirSync(".next/cache/data-review", { recursive: true });
    writeFileSync(`.next/cache/data-review/municipal-population-${new Date().toISOString().replaceAll(":", "-")}.json`, JSON.stringify({ dataset: systemDataset, results }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga municipal."); process.exitCode = 1; });
