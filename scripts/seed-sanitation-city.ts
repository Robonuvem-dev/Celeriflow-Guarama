import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accessProfiles, users } from "../src/db/schema/identity";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { consumerUnits, meterReadings, sanitationInvoices, sanitationPortalRequests, sanitationSavedReports, sanitationServiceOrders, waterMeters, waterQualityAnalyses } from "../src/db/schema/sanitation";
import { sanitationCityPlan, seedSanitationCity } from "./sanitation-city-dataset";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  const { db } = connection;
  const count = async (table: typeof consumerUnits | typeof waterMeters | typeof meterReadings | typeof sanitationInvoices | typeof sanitationServiceOrders | typeof waterQualityAnalyses | typeof sanitationPortalRequests | typeof sanitationSavedReports) => (await db.select({ value: sql<number>`count(*)::int` }).from(table))[0].value;
  const counts = async () => ({ units: await count(consumerUnits), meters: await count(waterMeters), readings: await count(meterReadings), invoices: await count(sanitationInvoices), serviceOrders: await count(sanitationServiceOrders), qualityAnalyses: await count(waterQualityAnalyses), portalRequests: await count(sanitationPortalRequests), reports: await count(sanitationSavedReports) });
  try {
    const before = await counts();
    console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "APPLY" : "PREVIEW", plan: sanitationCityPlan, before }, null, 2));
    if (!process.argv.includes("--apply")) return;
    const [actor] = await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1);
    if (!actor) throw new Error("Administrador ativo não encontrado.");
    const inserted = await withDatabaseTransaction(connection, async tx => {
      const tables = await seedSanitationCity(tx);
      if (Object.values(tables).some((count) => count > 0)) await tx.insert(financialAuditLogs).values({
        action: "MUNICIPAL_DATASET_POPULATED", entityType: "DATASET", entityId: sanitationCityPlan.dataset, authorUsuarioId: actor.id,
        payload: { dataset: sanitationCityPlan.dataset, fictional: true, mode: "ADDITIVE_ONLY", tables, inhabitants: sanitationCityPlan.inhabitants },
      });
      return tables;
    }, { timeoutMs: 600_000 });
    const after = await counts();
    const [invalidIdentifiers, orphanedReadings] = await Promise.all([
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "SanConsumerUnit" WHERE "code" !~ '^[0-9]{4}(0[1-9]|1[0-2])[0-9]{5}$'`),
      db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "SanMeterReading" r LEFT JOIN "SanWaterMeter" m ON m.id = r."meterId" WHERE r."meterId" IS NOT NULL AND (m.id IS NULL OR m."unitId" <> r."unitId")`),
    ]);
    console.log(JSON.stringify({ inserted, after, checks: { invalidIdentifiers: invalidIdentifiers.rows[0].count, invalidMeterLinks: orphanedReadings.rows[0].count } }, null, 2));
    if (invalidIdentifiers.rows[0].count || orphanedReadings.rows[0].count) throw new Error("A verificação final da carga encontrou inconsistências.");
  } finally { await connection.pool.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha na carga de saneamento."); process.exitCode = 1; });
