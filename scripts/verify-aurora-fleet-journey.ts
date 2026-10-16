import assert from "node:assert/strict";
import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { createFleetBooking, departFleetTrip, arriveFleetTrip } from "../src/lib/frotas/control-motion";
import type { FleetScope } from "../src/lib/frotas/service";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const rollback = new Error("ROLLBACK_FLEET_REHEARSAL");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let evidence: unknown;
  const counts = async () => ({ bookings: await prisma.fleetBooking.count(), trips: await prisma.fleetTrip.count(), gateEvents: await prisma.fleetGateEvent.count(), usages: await prisma.fleetUsage.count() });
  try {
    const before = await counts();
    const audit = await prisma.financialAuditLog.findFirstOrThrow({ where: { action: "PREPARE_FLEET_CATALOGS", entityId: "aurora-fleet-catalogs-2026-v1" } });
    const payload = audit.payload as Prisma.JsonObject;
    const unitId = String(payload.fleetUnitId), driverId = String(payload.driverId), routeId = String(payload.routeId);
    const controlBefore = await prisma.fleetUnitControl.findUniqueOrThrow({ where: { unitId } });
    try {
      await prisma.$transaction(async tx => {
        const user = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
        assert.ok(user.ativo && user.perfil.codigo === "SYSTEM_ADMINISTRATOR");
        const scope: FleetScope = { actorId: user.id, employeeId: user.employeeId, departmentId: String(payload.departmentId), administrator: true, canReadAssets: true, canIssueStock: true };
        const now = Date.now();
        const input = { unitId, driverId, routeId, kind: "VIAGEM", purpose: "Deslocamento administrativo para atendimento municipal", startsAt: new Date(now - 60000).toISOString(), endsAt: new Date(now + 3600000).toISOString() };
        const booking = await createFleetBooking(tx, scope, input);
        await assert.rejects(createFleetBooking(tx, scope, input), /já agendado/);
        const startReading = controlBefore.currentReading!;
        const trip = await departFleetTrip(tx, scope, { unitId, driverId, routeId, bookingId: booking.id, destination: "Unidade de atendimento municipal", purpose: input.purpose, reading: startReading.toFixed(0), checklist: { tires: true, lights: true } });
        await assert.rejects(departFleetTrip(tx, scope, { unitId, driverId, destination: "Unidade municipal", purpose: input.purpose, reading: startReading.toFixed(0) }), /agenda de outro uso|ainda não retornou/);
        await assert.rejects(arriveFleetTrip(tx, scope, { tripId: trip.id, reading: startReading.minus(1).toFixed(0), reason: "Retorno administrativo" }), /regressiva|inferior/);
        await arriveFleetTrip(tx, scope, { tripId: trip.id, reading: startReading.plus(12).toFixed(0), reason: "Retorno após atendimento administrativo" });
        const usage = await tx.fleetUsage.findUniqueOrThrow({ where: { tripId: trip.id } });
        assert.equal(usage.finalReading!.minus(usage.initialReading!).toFixed(0), "12");
        assert.equal((await tx.fleetBooking.findUniqueOrThrow({ where: { id: booking.id } })).status, "CONCLUIDO");
        assert.equal(await tx.fleetGateEvent.count({ where: { tripId: trip.id } }), 2);
        await assert.rejects(arriveFleetTrip(tx, scope, { tripId: trip.id, reading: startReading.plus(12).toFixed(0), reason: "Repetição de retorno" }), /já registrado/);
        evidence = { unitId, driverId, bookingCompleted: true, traveledKm: "12", gateEvents: 2, overlappingBookingRejected: true, duplicateDepartureRejected: true, regressiveReadingRejected: true, duplicateArrivalRejected: true };
        throw rollback;
      }, { timeout: 120000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { if (error !== rollback) throw error; }
    const after = await counts();
    assert.deepEqual(after, before);
    assert.equal((await prisma.fleetUnitControl.findUniqueOrThrow({ where: { unitId } })).currentReading!.toString(), controlBefore.currentReading!.toString());
    console.log(JSON.stringify({ evidence, rollbackVerified: true, before, after }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência da frota."); process.exitCode = 1; });
