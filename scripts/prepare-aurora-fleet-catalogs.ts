import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { mutateFleetInTransaction, fleetScope } from "../src/lib/frotas/service";
import { saveFleetDriver, saveFleetUnitControl } from "../src/lib/frotas/control-catalog";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { readFleetOperator } from "../src/db/repositories/fleet/operators";
import { requiredFleetRecord as one } from "../src/db/repositories/fleet/records";
import { departments, employees } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { fleetDrivers, fleetUnits } from "../src/db/schema/fleet";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-fleet-catalogs-2026-v1";
const departmentId = "aurora-procurement-actors-2026-v1:department";
const employeeId = `${key}:driver`;
const decision = "Cadastros exemplificativos autorizados: unidade administrativa da frota, rota, condutor e plano preventivo. Identificadores de veículo/CNH são sintéticos; sem consulta RENAVAM/DETRAN, propriedade, licença oficial ou compra presumidas. Vínculo patrimonial depende de incorporação pela origem documental. Parâmetros de uso ajustáveis pela administração.";

async function main() {
  const connection = databaseConnection;
  try {
    console.log(JSON.stringify(await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const { context, active } = await readFleetOperator(tx, "admin@email.com");
      const user = context.user;
      if (!active || !user.firebaseUid || user.departmentId !== departmentId) throw new Error("Operador autorizado sem vínculo funcional de origem.");
      const department = one(await tx.select().from(departments).where(eq(departments.id, departmentId)).limit(1));
      const unit = one((await tx.execute<{ secretariatId: string | null; governmentEntityId: string }>(sql`select u."secretariatId", b."governmentEntityId" from "BudgetUnit" u join "PlanningEntityUnit" b on b."budgetUnitId"=u."id" where u."id"='p0-current-exe-ug-1'`)).rows);
      if (!department.isActive || department.secretariatId !== unit.secretariatId || unit.governmentEntityId !== "p0-current-exe") throw new Error("Setor da frota divergente do Executivo.");
      const person = one(await tx.select().from(people).where(eq(people.id, "p1-poc-person-1")).limit(1));
      if (person.status !== "Ativo") throw new Error("Identidade fictícia canônica indisponível.");
      const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "PREPARE_FLEET_CATALOGS"), eq(financialAuditLogs.entityId, key))).limit(1);
      if (prior) {
        const payload = z.object({ employeeId: z.string(), departmentId: z.string(), fleetUnitId: z.string(), driverId: z.string() }).passthrough().parse(prior.payload);
        if (payload.employeeId !== employeeId || payload.departmentId !== departmentId) throw new Error("Preparação da frota divergente.");
        one(await tx.select().from(fleetUnits).where(eq(fleetUnits.id, payload.fleetUnitId)).limit(1));
        one(await tx.select().from(fleetDrivers).where(eq(fleetDrivers.id, payload.driverId)).limit(1));
        return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: true, evidence: payload };
      }
      if (!apply) return { mode: "READ_ONLY", replay: false, departmentId, employeeId, canonicalPersonId: person.id, decision };
      await tx.insert(employees).values({ id: employeeId, name: person.fullName, personId: person.id, departmentId, secretariatId: department.secretariatId });
      const route = await mutateFleetInTransaction(tx, context, { kind: "route", requestId: "da1dc1f1-d709-4d85-a06a-478248b30e70", data: { code: "AUR-ADM-01", name: "Rota administrativa municipal", origin: "Sede administrativa", destination: "Unidade de atendimento municipal", itinerary: "Sede administrativa → unidade de atendimento → sede administrativa", departmentId, active: "true" } });
      const vehicle = await mutateFleetInTransaction(tx, context, { kind: "unit", requestId: "85dcac60-2814-4e34-bb4b-f64576fa01b0", data: { code: "AUR-VEI-001", name: "Veículo administrativo", category: "VEICULO", status: "ATIVO", departmentId, plate: "AUR1A01", brand: "Volkswagen", model: "Gol 1.0", year: "2020", responsibleId: employeeId } });
      await saveFleetUnitControl(tx, fleetScope(context), { unitId: vehicle.id, version: "", meterType: "HODOMETRO", currentReading: "10000", fuelType: "Gasolina", tankCapacity: "50", expectedConsumption: "10", tolerancePercent: 20,
        fixedRouteId: route.id, allowedLicenseCategories: ["B"] });
      const driver = await saveFleetDriver(tx, fleetScope(context), { employeeId, departmentId, outsourced: false, cnhNumber: "90000000001", cnhCategories: ["B"], cnhExpiresAt: "2027-12-31", active: true, pointLimit: 20, pointWindowMonths: 12, policyReference: decision });
      const plan = await mutateFleetInTransaction(tx, context, { kind: "plan", requestId: "7b4b9a04-c334-4a4d-afc0-1e1cc17e42c8", data: { unitId: vehicle.id, title: "Inspeção preventiva administrativa", type: "PREVENTIVA", services: "Inspecionar pneus, fluidos, iluminação e itens de segurança; registrar resultado técnico.", firstDueAt: "2026-10-20", intervalDays: "90", estimatedCost: "350" } });
      const payload = { decision, departmentId, employeeId, canonicalPersonId: person.id, fleetUnitId: vehicle.id, driverId: driver.id, routeId: route.id, planId: plan.id,
        identifierOrigin: "SYNTHETIC_NOT_DETRAN_VERIFIED", patrimonialOrigin: "UNLINKED_PENDING_DOCUMENTED_ACQUISITION", parameterOrigin: "OWNER_ESTIMATE" };
      await tx.insert(financialAuditLogs).values({ action: "PREPARE_FLEET_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: user.id, payload });
      return { mode: "ADDITIVE_IDEMPOTENT", replay: false, evidence: payload };
    }, { timeoutMs: 120000 }), null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação da frota."); process.exitCode = 1; });
