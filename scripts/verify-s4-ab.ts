import { config } from "dotenv";
import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { employees } from "../src/db/schema/administration";
import { suppliers } from "../src/db/schema/registry";
import { fleetUnits } from "../src/db/schema/fleet";
import { healthUnits, healthProfessionals } from "../src/db/schema/health-workforce";
import { healthSpecialties } from "../src/db/schema/health-administration";
import { patients } from "../src/db/schema/health-registration";
import { healthRegulationRequests, healthRegulationEvents, healthRegulationQuotas } from "../src/db/schema/health-regulation";
import { healthTfdPassengers, healthTfdTrips, healthTfdRequests } from "../src/db/schema/health-tfd";
import { healthProductionFacts, healthProductionCriticisms } from "../src/db/schema/health-production";
import type { AppContext } from "../src/lib/platform/tenant-context";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  const { saveRegulationQuota, createRegulationRequest, transitionRegulationRequest } = await import("../src/lib/saude/regulation-service");
  const { createTfdRequest, authorizeTfdRequest, createTfdTrip, addPassenger, updateTripStatus } = await import("../src/lib/saude/tfd-service");
  try {
    const [usuario] = await db.select().from(users).where(isNotNull(users.employeeId)).limit(1);
    if (!usuario?.employeeId) throw new Error("Usuario com employee não encontrado");
    const ctx: AppContext = { database: db, user: { id: usuario.id, firebaseUid: usuario.firebaseUid || "", email: usuario.email, name: usuario.nome, role: "admin", profileCode: "ADMIN", modulePermissions: [], allowedBudgetUnitIds: [], allowedHealthUnitIds: [], hasHealthAccessScope: false, employeeId: usuario.employeeId, departmentId: null, secretariatId: null } };
    const [unit] = await db.select().from(healthUnits).where(eq(healthUnits.isActive,true)).limit(1);
    const [patient] = await db.select().from(patients).where(eq(patients.status,"Ativo")).limit(1);
    const [patient2] = await db.select().from(patients).where(and(eq(patients.status,"Ativo"),ne(patients.id,patient!.id))).limit(1);
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.status,"Ativo")).limit(1);
    const [specialty] = await db.select().from(healthSpecialties).where(eq(healthSpecialties.isActive,true)).limit(1);
    let [fleet] = await db.select().from(fleetUnits).where(eq(fleetUnits.category,"VEICULO")).limit(1);
    if (!fleet) {
      [fleet] = await db.insert(fleetUnits).values({code:`TFD-${Date.now()}`,name:"Veículo TFD 01",category:"VEICULO",plate:`TST${Date.now().toString().slice(-4)}`,createdById:usuario.id}).returning();
    }
    const [driver] = await db.select().from(employees).where(eq(employees.isActive,true)).limit(1);
    const [professional] = await db.select({id:healthProfessionals.id}).from(healthProfessionals).where(eq(healthProfessionals.isActive,true)).limit(1);
    if (!unit || !patient || !supplier || !fleet) throw new Error("Massa mínima ausente para S4");
    // Cleanup previous test data
    await db.delete(healthTfdPassengers).where(eq(healthTfdPassengers.patientId,patient.id));
    await db.delete(healthTfdTrips).where(eq(healthTfdTrips.fleetUnitId,fleet.id));
    await db.delete(healthTfdRequests).where(eq(healthTfdRequests.patientId,patient.id));
    await db.delete(healthRegulationEvents).where(inArray(healthRegulationEvents.requestId,db.select({id:healthRegulationRequests.id}).from(healthRegulationRequests).where(eq(healthRegulationRequests.patientId,patient.id))));
    await db.delete(healthRegulationRequests).where(eq(healthRegulationRequests.patientId,patient.id));
    await db.delete(healthRegulationQuotas).where(and(eq(healthRegulationQuotas.providerSupplierId,supplier.id),eq(healthRegulationQuotas.period,"2026-09")));
    await db.delete(healthProductionCriticisms).where(inArray(healthProductionCriticisms.factId,db.select({id:healthProductionFacts.id}).from(healthProductionFacts).where(and(eq(healthProductionFacts.patientId,patient.id),eq(healthProductionFacts.originType,"REGULATION")))));
    await db.delete(healthProductionFacts).where(and(eq(healthProductionFacts.patientId,patient.id),eq(healthProductionFacts.originType,"REGULATION")));

    console.log("Creating quota 10");
    const quota = await saveRegulationQuota(ctx, { providerSupplierId: supplier.id, unitId: unit.id, specialtyId: specialty?.id || null, period: "2026-09", totalQuantity: 10 });
    console.log("quota", quota.id);

    console.log("Create request PEP_REFERRAL via direct");
    const req = await createRegulationRequest(ctx, { patientId: patient.id, requestUnitId: unit.id, professionalId: professional?.id || null, specialtyId: specialty?.id || null, priority: "Normal", description: "Avaliação para atenção especializada", origin: "DIRECT" });
    console.log("req", req.id);

    console.log("Authorize");
    await transitionRegulationRequest(ctx, req.id, "AUTORIZADA", { quotaId: quota.id });
    let [q] = await db.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id,quota.id));
    console.log("after authorize", q);
    if (q!.reservedQuantity !== 1) throw new Error("Reserva falhou");

    console.log("Execute");
    await transitionRegulationRequest(ctx, req.id, "EXECUTADA", {});
    [q] = await db.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id,quota.id));
    console.log("after exec", q);
    if (q!.reservedQuantity !== 0 || q!.realizedQuantity !== 1) throw new Error("Consumo falhou");

    console.log("Cancel test");
    const req2 = await createRegulationRequest(ctx, { patientId: patient.id, requestUnitId: unit.id, professionalId: professional?.id || null, priority: "Normal", description: "Avaliação de retorno" });
    await transitionRegulationRequest(ctx, req2.id, "AUTORIZADA", { quotaId: quota.id });
    [q] = await db.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id,quota.id));
    console.log("after 2nd authorize", q);
    await transitionRegulationRequest(ctx, req2.id, "CANCELADA", {});
    [q] = await db.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id,quota.id));
    console.log("after cancel", q);
    if (q!.reservedQuantity !== 0) throw new Error("Devolução falhou");
    const [guide] = await db.select({guideNumber:healthRegulationRequests.guideNumber}).from(healthRegulationRequests).where(eq(healthRegulationRequests.id,req.id));
    console.log("guide", guide);
    if (!guide?.guideNumber) throw new Error("Guia não gerada");

    console.log("TFD flow");
    const tfd = await createTfdRequest(ctx, { patientId: patient.id, originUnitId: unit.id, destination: "Hospital Regional de Referência", reason: "Consulta especializada", priority: "Normal" });
    console.log("tfd", tfd.id);
    await authorizeTfdRequest(ctx, tfd.id);
    const trip = await createTfdTrip(ctx, { date: "2026-09-25", origin: unit.name, destination: "Hospital Regional de Referência", fleetUnitId: fleet.id, driverEmployeeId: driver!.id, capacity: 2 });
    console.log("trip", trip.id);
    await addPassenger(ctx, { tripId: trip.id, patientId: patient.id, tfdRequestId: tfd.id, kind: "PACIENTE" });
    // companion for same patient counts as second seat
    await addPassenger(ctx, { tripId: trip.id, patientId: patient.id, companionName: "Acompanhante familiar", kind: "ACOMPANHANTE" });
    const [{value:cnt}] = await db.select({value:count()}).from(healthTfdPassengers).where(eq(healthTfdPassengers.tripId,trip.id));
    console.log("passengers", cnt);
    if (cnt !== 2) throw new Error("Passageiros incorretos");
    try {
      const p3 = patient2 || patient;
      await addPassenger(ctx, { tripId: trip.id, patientId: p3.id, kind: "PACIENTE" });
      throw new Error("Deveria falhar capacidade");
    } catch (e: unknown) {
      if (!String(e instanceof Error ? e.message : e).includes("Capacidade")) throw e;
      console.log("capacidade bloqueada ok");
    }
    await updateTripStatus(ctx, trip.id, "EMBARCANDO");
    await updateTripStatus(ctx, trip.id, "EM_TRANSITO");
    await updateTripStatus(ctx, trip.id, "CONCLUIDA");
    console.log("tfd trip concluída");

    console.log(JSON.stringify({ status: "S4-AB READY", quota: q, guide: guide.guideNumber }, null, 2));
  } finally {
    await databaseConnection.pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
