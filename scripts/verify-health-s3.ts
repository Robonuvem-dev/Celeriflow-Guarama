import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  const database = connection.db;
  try {
    const medicineCounts = (await database.execute<{ linked: string; unlinked: string }>(sql`
      SELECT COUNT(*) FILTER (WHERE "isActive" AND "materialId" IS NOT NULL)::bigint AS linked,
             COUNT(*) FILTER (WHERE "isActive" AND "materialId" IS NULL)::bigint AS unlinked
      FROM "Medicine"`)).rows[0];
    const vaccineCounts = (await database.execute<{ linked: string; unlinked: string }>(sql`
      SELECT COUNT(*) FILTER (WHERE "isActive" AND "materialId" IS NOT NULL)::bigint AS linked,
             COUNT(*) FILTER (WHERE "isActive" AND "materialId" IS NULL)::bigint AS unlinked
      FROM "Vaccine"`)).rows[0];
    const totals = (await database.execute<{ activeUnits: number; activePatients: number; activeProfessionals: number; teams: number; assistentialProfiles: number; prescriptions: number; examRequests: number }>(sql`SELECT
      (SELECT count(*)::int FROM "HealthUnit" WHERE "isActive"=true) AS "activeUnits",
      (SELECT count(*)::int FROM "Patient" WHERE status='Ativo') AS "activePatients",
      (SELECT count(*)::int FROM "HealthProfessional" WHERE "isActive"=true) AS "activeProfessionals",
      (SELECT count(*)::int FROM "HealthTeam" WHERE "isActive"=true) AS teams,
      (SELECT count(*)::int FROM "HealthMaterialProfile" WHERE "isActive"=true) AS "assistentialProfiles",
      (SELECT count(*)::int FROM "HealthPrescription") AS prescriptions,
      (SELECT count(*)::int FROM "HealthExamRequest") AS "examRequests"`)).rows[0];
    const checks = {
      activeUnits: totals.activeUnits,
      activePatients: totals.activePatients,
      activeProfessionals: totals.activeProfessionals,
      teams: totals.teams,
      linkedMedicines: Number(medicineCounts.linked),
      unlinkedMedicines: Number(medicineCounts.unlinked),
      linkedVaccines: Number(vaccineCounts.linked),
      unlinkedVaccines: Number(vaccineCounts.unlinked),
      assistentialProfiles: totals.assistentialProfiles,
      prescriptions: totals.prescriptions,
      examRequests: totals.examRequests,
    };

    if (checks.unlinkedMedicines || checks.unlinkedVaccines) throw new Error("Há medicamentos ou imunobiológicos ativos fora do cadastro único de materiais.");
    for (const [key, value] of Object.entries(checks)) {
      if (!["unlinkedMedicines", "unlinkedVaccines"].includes(key) && value === 0) throw new Error(`Massa mínima ausente: ${key}.`);
    }

    console.log(JSON.stringify({ status: "READY", ...checks }, null, 2));
  } finally {
    await connection.pool.end();
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
