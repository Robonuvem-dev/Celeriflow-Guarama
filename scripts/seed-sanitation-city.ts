import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { sanitationCityPlan, seedSanitationCity } from "./sanitation-city-dataset";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;

async function main() {
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
  const counts = async () => ({
    units: await db.sanConsumerUnit.count(), meters: await db.sanWaterMeter.count(), readings: await db.sanMeterReading.count(),
    invoices: await db.sanInvoice.count(), serviceOrders: await db.sanServiceOrder.count(), qualityAnalyses: await db.sanWaterQualityAnalysis.count(),
    portalRequests: await db.sanPortalRequest.count(), reports: await db.sanSavedReport.count(),
  });
  try {
    const before = await counts();
    console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "APPLY" : "PREVIEW", plan: sanitationCityPlan, before }, null, 2));
    if (!process.argv.includes("--apply")) return;
    const actor = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true } });
    const inserted = await db.$transaction(async (tx) => {
      const tables = await seedSanitationCity(tx);
      if (Object.values(tables).some((count) => count > 0)) await tx.financialAuditLog.create({ data: {
        action: "MUNICIPAL_DATASET_POPULATED", entityType: "DATASET", entityId: sanitationCityPlan.dataset, authorUsuarioId: actor.id,
        payload: { dataset: sanitationCityPlan.dataset, fictional: true, mode: "ADDITIVE_ONLY", tables, inhabitants: sanitationCityPlan.inhabitants },
      } });
      return tables;
    }, { timeout: 600_000, maxWait: 20_000 });
    const after = await counts();
    const [invalidIdentifiers, orphanedReadings] = await Promise.all([
      db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "SanConsumerUnit" WHERE "code" !~ '^[0-9]{4}(0[1-9]|1[0-2])[0-9]{5}$'`,
      db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "SanMeterReading" r LEFT JOIN "SanWaterMeter" m ON m.id = r."meterId" WHERE r."meterId" IS NOT NULL AND (m.id IS NULL OR m."unitId" <> r."unitId")`,
    ]);
    console.log(JSON.stringify({ inserted, after, checks: { invalidIdentifiers: Number(invalidIdentifiers[0].count), invalidMeterLinks: Number(orphanedReadings[0].count) } }, null, 2));
    if (Number(invalidIdentifiers[0].count) || Number(orphanedReadings[0].count)) throw new Error("A verificação final da carga encontrou inconsistências.");
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha na carga de saneamento."); process.exitCode = 1; });
