import { config } from "dotenv";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mutateFleet, fleetScope } from "../src/lib/frotas/service";
import { saveFleetDriver, saveFleetUnitControl } from "../src/lib/frotas/control-catalog";
import type { AppContext } from "../src/lib/platform/tenant-context";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-fleet-catalogs-2026-v1";
const departmentId = "aurora-procurement-actors-2026-v1:department";
const employeeId = `${key}:driver`;
const decision = "Cadastros exemplificativos autorizados: unidade administrativa da frota, rota, condutor e plano preventivo. Identificadores de veículo/CNH são sintéticos; sem consulta RENAVAM/DETRAN, propriedade, licença oficial ou compra presumidas. Vínculo patrimonial depende de incorporação pela origem documental. Parâmetros de uso ajustáveis pela administração.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const user = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true, employee: true, unidadesGestoras: true, permissoesModulo: { include: { modulo: true } } } });
      if (!user.ativo || !user.firebaseUid || user.employee?.departmentId !== departmentId) throw new Error("Operador autorizado sem vínculo funcional de origem.");
      const department = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: "p0-current-exe-ug-1" } });
      const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: unit.id } });
      if (!department.isActive || department.secretariatId !== unit.secretariatId || binding.governmentEntityId !== "p0-current-exe") throw new Error("Setor da frota divergente do Executivo.");
      const person = await tx.person.findUniqueOrThrow({ where: { id: "p1-poc-person-1" } });
      if (person.status !== "Ativo") throw new Error("Identidade fictícia canônica indisponível.");
      const db = new Proxy(tx, { get(target, property) {
        if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx);
        return Reflect.get(target, property);
      } }) as unknown as PrismaClient;
      const context: AppContext = { prisma: db, user: { id: user.id, firebaseUid: user.firebaseUid, email: user.email, name: user.nome, role: user.perfil.codigo, profileCode: user.perfil.codigo,
        permissions: user.perfil.permissoes, employeeId: user.employeeId, departmentId, secretariatId: user.employee!.secretariatId,
        allowedBudgetUnitIds: user.unidadesGestoras.map(item => item.budgetUnitId), modulePermissions: user.permissoesModulo.map(item => ({ code: item.modulo.codigo, canView: item.canView, canEdit: item.canEdit })) } };
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_FLEET_CATALOGS", entityId: key } });
      if (prior) {
        const payload = prior.payload as Prisma.JsonObject;
        if (payload.employeeId !== employeeId || payload.departmentId !== departmentId) throw new Error("Preparação da frota divergente.");
        await tx.fleetUnit.findUniqueOrThrow({ where: { id: String(payload.fleetUnitId) } });
        await tx.fleetDriver.findUniqueOrThrow({ where: { id: String(payload.driverId) } });
        return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: true, evidence: payload };
      }
      if (!apply) return { mode: "READ_ONLY", replay: false, departmentId, employeeId, canonicalPersonId: person.id, decision };
      await tx.employee.create({ data: { id: employeeId, name: person.fullName, personId: person.id, departmentId, secretariatId: department.secretariatId } });
      const route = await mutateFleet(context, { kind: "route", requestId: "da1dc1f1-d709-4d85-a06a-478248b30e70", data: { code: "AUR-ADM-01", name: "Rota administrativa municipal", origin: "Sede administrativa", destination: "Unidade de atendimento municipal", itinerary: "Sede administrativa → unidade de atendimento → sede administrativa", departmentId, active: "true" } });
      const vehicle = await mutateFleet(context, { kind: "unit", requestId: "85dcac60-2814-4e34-bb4b-f64576fa01b0", data: { code: "AUR-VEI-001", name: "Veículo administrativo", category: "VEICULO", status: "ATIVO", departmentId, plate: "AUR1A01", brand: "Volkswagen", model: "Gol 1.0", year: "2020", responsibleId: employeeId } });
      await saveFleetUnitControl(tx, fleetScope(context), { unitId: vehicle.id, version: "", meterType: "HODOMETRO", currentReading: "10000", fuelType: "Gasolina", tankCapacity: "50", expectedConsumption: "10", tolerancePercent: 20,
        fixedRouteId: route.id, allowedLicenseCategories: ["B"] });
      const driver = await saveFleetDriver(tx, fleetScope(context), { employeeId, departmentId, outsourced: false, cnhNumber: "90000000001", cnhCategories: ["B"], cnhExpiresAt: "2027-12-31", active: true, pointLimit: 20, pointWindowMonths: 12, policyReference: decision });
      const plan = await mutateFleet(context, { kind: "plan", requestId: "7b4b9a04-c334-4a4d-afc0-1e1cc17e42c8", data: { unitId: vehicle.id, title: "Inspeção preventiva administrativa", type: "PREVENTIVA", services: "Inspecionar pneus, fluidos, iluminação e itens de segurança; registrar resultado técnico.", firstDueAt: "2026-10-20", intervalDays: "90", estimatedCost: "350" } });
      const payload = { decision, departmentId, employeeId, canonicalPersonId: person.id, fleetUnitId: vehicle.id, driverId: driver.id, routeId: route.id, planId: plan.id,
        identifierOrigin: "SYNTHETIC_NOT_DETRAN_VERIFIED", patrimonialOrigin: "UNLINKED_PENDING_DOCUMENTED_ACQUISITION", parameterOrigin: "OWNER_ESTIMATE" };
      await tx.financialAuditLog.create({ data: { action: "PREPARE_FLEET_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: user.id, payload } });
      return { mode: "ADDITIVE_IDEMPOTENT", replay: false, evidence: payload };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação da frota."); process.exitCode = 1; });
