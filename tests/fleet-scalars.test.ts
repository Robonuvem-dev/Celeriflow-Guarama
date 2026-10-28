import "./helpers/fleet-test-environment";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { databaseTimestamp } from "../src/db/temporal";
import { readFleetPaidAmount, readFleetTfdBoarding } from "../src/db/repositories/fleet/sources";
import { throttleFleetExternal } from "../src/lib/frotas/control-external";
import { createFleetTestDatabase } from "./fleet-fixture";

test("Frotas · escalares raw preservam UTC, precisão exata e relações TFD opcionais", async () => {
  const fixture = await createFleetTestDatabase(false), { connection } = fixture;
  try {
    // Explicit projections of installed columns, including the clinical report's
    // real requestId FK. No generated schema or alternative client is involved.
    await fixture.database.exec(`
      CREATE TABLE "HealthTfdTrip" ("id" TEXT PRIMARY KEY, "fleetBookingId" TEXT, "status" TEXT NOT NULL, "confirmedAt" TIMESTAMP(3));
      CREATE TABLE "HealthTfdRequest" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL);
      CREATE TABLE "HealthTfdClinicalReport" ("id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE REFERENCES "HealthTfdRequest"("id"), "companionRequired" BOOLEAN NOT NULL);
      CREATE TABLE "HealthTfdPassenger" ("id" TEXT PRIMARY KEY, "tripId" TEXT NOT NULL REFERENCES "HealthTfdTrip"("id"), "patientId" TEXT NOT NULL, "kind" TEXT NOT NULL, "presenceStatus" TEXT NOT NULL, "tfdRequestId" TEXT REFERENCES "HealthTfdRequest"("id"));
      CREATE TABLE "HealthTfdPassengerRemoval" ("passengerId" TEXT NOT NULL UNIQUE REFERENCES "HealthTfdPassenger"("id"), "status" TEXT NOT NULL);
      CREATE TABLE "Payment" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "valueDecimal" NUMERIC(18,2));
      CREATE TABLE "FleetExternalThrottle" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "windowEndsAt" TIMESTAMP(3) NOT NULL);
      INSERT INTO "HealthTfdTrip" VALUES ('trip', 'booking', 'EMBARCANDO', '2026-10-15 12:34:56.789'), ('unconfirmed', 'pending', 'PLANEJADA', NULL);
      INSERT INTO "HealthTfdRequest" VALUES ('request', 'AGENDADA');
      INSERT INTO "HealthTfdClinicalReport" VALUES ('report', 'request', TRUE);
      INSERT INTO "HealthTfdPassenger" VALUES ('patient', 'trip', 'person', 'PACIENTE', 'PRESENT', 'request'), ('companion', 'trip', 'person', 'ACOMPANHANTE', 'PRESENT', NULL), ('removed', 'trip', 'other', 'PACIENTE', 'ABSENT', NULL);
      INSERT INTO "HealthTfdPassengerRemoval" VALUES ('removed', 'Confirmada');
      INSERT INTO "Payment" VALUES ('paid', 'Pago', 9007199254740991.23), ('pending', 'Pendente', 10.00), ('unknown', 'Pago', NULL);
    `);
    const raw = await connection.db.execute<{ confirmedAt: string }>(sql`select "confirmedAt" from "HealthTfdTrip" where "id"='trip'`);
    assert.equal(typeof raw.rows[0].confirmedAt, "string", "execute<T> does not decode a temporal generic");
    const trip = await withDatabaseTransaction(connection, tx => readFleetTfdBoarding(tx, "booking"));
    assert.ok(trip?.confirmedAt instanceof Date);
    assert.equal(trip.confirmedAt.toISOString(), "2026-10-15T12:34:56.789Z");
    assert.equal(trip.passengers.length, 2);
    assert.ok(trip.passengers.every(row => row.identityKind === row.kind && row.patientId === "person"));
    assert.deepEqual(trip.passengers.find(row => row.kind === "PACIENTE")?.tfdRequest, { status: "AGENDADA", clinicalReport: { companionRequired: true } });
    assert.equal(trip.passengers.find(row => row.kind === "ACOMPANHANTE")?.tfdRequest, null);
    assert.equal((await withDatabaseTransaction(connection, tx => readFleetTfdBoarding(tx, "pending")))?.confirmedAt, null);
    assert.equal(await withDatabaseTransaction(connection, tx => readFleetTfdBoarding(tx, "missing")), null);
    assert.equal((await readFleetPaidAmount(connection.db, "paid"))?.toFixed(2), "9007199254740991.23");
    assert.equal(await readFleetPaidAmount(connection.db, "pending"), null);
    assert.equal(await readFleetPaidAmount(connection.db, "unknown"), null);
    const before = Date.now();
    await throttleFleetExternal(connection.db, "source");
    const after = Date.now();
    const window = await connection.db.execute<{ count: number; windowEndsAt: string }>(sql`select "count", "windowEndsAt" from "FleetExternalThrottle" where "key"='source'`);
    const expiresAt = databaseTimestamp(window.rows[0].windowEndsAt).getTime();
    assert.ok(expiresAt >= before + 60000 && expiresAt <= after + 60000, "raw timestamp parameters retain UTC on non-UTC hosts");
    for (let attempt = 2; attempt <= 8; attempt++) await throttleFleetExternal(connection.db, "source");
    await assert.rejects(throttleFleetExternal(connection.db, "source"), /Muitas tentativas/);
    await connection.db.execute(sql`update "FleetExternalThrottle" set "windowEndsAt"='2000-01-01 00:00:00' where "key"='source'`);
    await throttleFleetExternal(connection.db, "source");
    const reset = await connection.db.execute<{ count: number }>(sql`select "count" from "FleetExternalThrottle" where "key"='source'`);
    assert.equal(reset.rows[0].count, 1);
  } finally { await fixture.close(); }
});
