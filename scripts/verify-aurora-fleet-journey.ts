import assert from "node:assert/strict";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { countFleetRecords, requiredFleetRecord as one } from "../src/db/repositories/fleet/records";
import { readFleetOperator } from "../src/db/repositories/fleet/operators";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import * as f from "../src/db/schema/fleet";
import { createFleetBooking, departFleetTrip, arriveFleetTrip } from "../src/lib/frotas/control-motion";
import type { FleetScope } from "../src/lib/frotas/service";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const rollback = new Error("ROLLBACK_FLEET_REHEARSAL");

async function main() {
  const connection = databaseConnection, db = connection.db;
  let evidence: unknown;
  const counts = async () => ({ bookings: await countFleetRecords(db, f.fleetBookings), trips: await countFleetRecords(db, f.fleetTrips), gateEvents: await countFleetRecords(db, f.fleetGateEvents), usages: await countFleetRecords(db, f.fleetUsages) });
  try {
    const before = await counts();
    const audit = one(await db.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "PREPARE_FLEET_CATALOGS"), eq(financialAuditLogs.entityId, "aurora-fleet-catalogs-2026-v1"))).limit(1));
    const payload = z.object({ fleetUnitId: z.string(), driverId: z.string(), routeId: z.string(), departmentId: z.string() }).parse(audit.payload);
    const { fleetUnitId: unitId, driverId, routeId } = payload;
    const controlBefore = one(await db.select().from(f.fleetUnitControls).where(eq(f.fleetUnitControls.unitId, unitId)).limit(1));
    try {
      await withDatabaseTransaction(connection, async tx => {
        const { context: { user }, active } = await readFleetOperator(tx, "admin@email.com");
        assert.ok(active && user.profileCode === "SYSTEM_ADMINISTRATOR");
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
        const usage = one(await tx.select().from(f.fleetUsages).where(eq(f.fleetUsages.tripId, trip.id)).limit(1));
        assert.equal(usage.finalReading!.minus(usage.initialReading!).toFixed(0), "12");
        assert.equal(one(await tx.select().from(f.fleetBookings).where(eq(f.fleetBookings.id, booking.id)).limit(1)).status, "CONCLUIDO");
        assert.equal(await countFleetRecords(tx, f.fleetGateEvents, eq(f.fleetGateEvents.tripId, trip.id)), 2);
        await assert.rejects(arriveFleetTrip(tx, scope, { tripId: trip.id, reading: startReading.plus(12).toFixed(0), reason: "Repetição de retorno" }), /já registrado/);
        evidence = { unitId, driverId, bookingCompleted: true, traveledKm: "12", gateEvents: 2, overlappingBookingRejected: true, duplicateDepartureRejected: true, regressiveReadingRejected: true, duplicateArrivalRejected: true };
        throw rollback;
      }, { timeoutMs: 120000, isolationLevel: "serializable" });
    } catch (error) { if (error !== rollback) throw error; }
    const after = await counts();
    assert.deepEqual(after, before);
    assert.equal(one(await db.select().from(f.fleetUnitControls).where(eq(f.fleetUnitControls.unitId, unitId)).limit(1)).currentReading!.toString(), controlBefore.currentReading!.toString());
    console.log(JSON.stringify({ evidence, rollbackVerified: true, before, after }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência da frota."); process.exitCode = 1; });
