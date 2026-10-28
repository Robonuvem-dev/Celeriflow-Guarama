import "./helpers/tfd-test-environment";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { and, count, eq, sql, SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { PDFDocument as PdfReader } from "pdf-lib";
import { Decimal } from "../src/db/decimal";
import { JsonNull } from "../src/db/json";
import { databaseTimestamp } from "../src/db/temporal";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as t from "../src/db/schema/health-tfd";
import { healthProfessionals, healthProfessionalAssignments } from "../src/db/schema/health-workforce";
import { people } from "../src/db/schema/people";
import { hrPortalRequests } from "../src/db/schema/personnel-workforce";
import { fleetBookings, fleetTrips, fleetUsages, fleetGateEvents } from "../src/db/schema/fleet";
import { activeTfdPassengerWhere, readTfdTrip, tfdSnapshot, tfdTripAccessWhere } from "../src/db/repositories/health-tfd/records";
import { addTfdReportSupplement, requestTfdBenefit, saveTfdClinicalReport, tfdRequestForActor, transitionTfdBenefit, transitionTfdClinicalRequest } from "../src/lib/saude/tfd-clinical-service";
import { addPassenger, authorizeTfdRequest, confirmPassengerRemoval, createTfdRequest, createTfdTrip, movePassenger, requestPassengerRemoval, updateTripStatus } from "../src/lib/saude/tfd-service";
import { confirmTfdTrip, createTfdTripFromBooking, healthTransportFleetScope, recordTfdPassengerBoarding } from "../src/lib/saude/tfd-transport-service";
import { assertTfdBoardingReady } from "../src/lib/saude/tfd-transport-policy";
import { tfdPatientDocument } from "../src/lib/saude/tfd-document-service";
import { tfdTripDocument } from "../src/lib/saude/tfd-trip-document";
import { tfdProcessReport } from "../src/lib/saude/tfd-report-service";
import { createFleetBooking, departFleetTrip, arriveFleetTrip } from "../src/lib/frotas/control-motion";
import { createTfdDrizzleFixture, tfdClinicalInput, tfdTestContext } from "./helpers/tfd-drizzle-fixture";

function isInjectedTfdEventFailure(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && current.code === "P0001" && "message" in current && current.message === "injected TFD event failure") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

test("TFD · mapeamentos completos correspondem ao catálogo físico independente", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as {
    catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean; default_expression: string | null }[]; constraints: { schema: string; table_name: string; name: string; type: string; definition: string }[] };
  };
  const normalize = (value: string) => value.replaceAll('"', "").replace(/\s/g, "").toLowerCase();
  const dialect = new PgDialect();
  for (const table of Object.values(t)) {
    const config = getTableConfig(table), columns = catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    assert.equal(config.columns.length, columns.length, config.name);
    for (const column of config.columns) {
      const physical = columns.find(row => row.name === column.name);
      assert.ok(physical, column.name);
      assert.equal(column.notNull, physical.not_null, `${config.name}.${column.name}`);
      assert.equal(normalize(column.getSQLType()).replace("withouttimezone", ""), normalize(physical.type).replace("withouttimezone", ""));
      assert.equal(column.default !== undefined, physical.default_expression !== null, `${config.name}.${column.name} SQL default`);
      if (column.default !== undefined) {
        const expression = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
        const normalizeDefault = (value: string) => normalize(value).replace("current_timestamp", "now()").replace("::text", "");
        assert.equal(normalizeDefault(expression), normalizeDefault(physical.default_expression || ""));
      }
    }
    const fks = catalog.constraints.filter(row => row.schema === "public" && row.table_name === config.name && row.type === "f");
    assert.equal(config.foreignKeys.length, fks.length, config.name);
    for (const fk of config.foreignKeys) {
      const physical = fks.find(row => row.name === fk.getName()), reference = fk.reference();
      assert.ok(physical, fk.getName());
      assert.ok(normalize(physical.definition).includes(normalize(`FOREIGN KEY (${reference.columns.map(column => column.name).join(",")}) REFERENCES ${getTableConfig(reference.foreignTable).name}(${reference.foreignColumns.map(column => column.name).join(",")})`)));
      assert.ok(physical.definition.includes(`ON DELETE ${(fk.onDelete ?? "no action").toUpperCase()}`));
      assert.ok(physical.definition.includes(`ON UPDATE ${(fk.onUpdate ?? "no action").toUpperCase()}`));
    }
    for (const check of config.checks) assert.ok(catalog.constraints.some(row => row.schema === "public" && row.table_name === config.name && row.name === check.name && row.type === "c"));
  }
});

test("TFD · política pura conserva vínculo de acompanhante e tratamento", () => {
  const patient = { patientId: "patient", kind: "PACIENTE", presenceStatus: "BOARDED", tfdRequest: { status: "AUTORIZADA", clinicalReport: { companionRequired: true } } };
  const companion = { patientId: "patient", kind: "ACOMPANHANTE", presenceStatus: "BOARDED", tfdRequest: null };
  assertTfdBoardingReady([patient, companion]);
  assert.throws(() => assertTfdBoardingReady([patient]), /acompanhante/);
  assert.throws(() => assertTfdBoardingReady([companion]), /paciente/);
  assert.throws(() => assertTfdBoardingReady([patient, { ...companion, patientId: "other" }]), /acompanhante/);
  assert.throws(() => assertTfdBoardingReady([patient, { ...companion, presenceStatus: "PENDING" }]), /embarque/);
  assert.throws(() => assertTfdBoardingReady([{ ...patient, tfdRequest: { status: "CANCELADA", clinicalReport: null } }, companion]), /autorizado/);
  assert.deepEqual(tfdSnapshot({ date: new Date("2026-10-28T03:04:05.006Z"), optional: undefined, null: null, text: '{"amount":"001.00"}' }), { date: "2026-10-28T03:04:05.006Z", null: null, text: '{"amount":"001.00"}' });
});

test("TFD · fluxo real Neon/Drizzle, revisões, sigilo, concorrência e Frotas na tx original", async suite => {
  const f = await createTfdDrizzleFixture(), { connection, db, context, restricted } = f;
  const requestInput = { patientId: "tfd-patient", originUnitId: "tfd-u1", destination: "Hospital regional", reason: "Tratamento fora do município" };
  const tripInput = { date: "2026-10-28", origin: "Unidade solicitante", destination: "Hospital regional", fleetUnitId: "tfd-vehicle", capacity: 2 };
  const requests = () => db.select().from(t.healthTfdRequests);
  try {
    await suite.test("solicitação aplica escopos/titular e falha no evento reverte a criação", async () => {
      await assert.rejects(createTfdRequest(restricted, { ...requestInput, originUnitId: "tfd-u2" }, connection), /acesso/i);
      await assert.rejects(createTfdRequest(restricted, { ...requestInput, patientId: "tfd-patient2" }, connection), /acesso/i);
      await assert.rejects(createTfdRequest(restricted, { ...requestInput, patientId: "tfd-patient3" }, connection), /sem unidade/i);
      await assert.rejects(createTfdRequest(restricted, { ...requestInput, originUnitId: null }, connection), /origem/i);
      await assert.rejects(createTfdRequest(context, { ...requestInput, regulationRequestId: "tfd-wrong-regulation" }, connection), /não pertence/);
      const before = (await requests()).length;
      await f.database.exec(`CREATE TRIGGER tfd_fail_request_event BEFORE INSERT ON "HealthTfdRequestEvent" FOR EACH ROW EXECUTE FUNCTION tfd_fail_event();`);
      try { await assert.rejects(createTfdRequest(context, requestInput, connection), isInjectedTfdEventFailure); }
      finally { await f.database.exec(`DROP TRIGGER tfd_fail_request_event ON "HealthTfdRequestEvent";`); }
      assert.equal((await requests()).length, before);
      const request = await createTfdRequest(context, { ...requestInput, regulationRequestId: "tfd-regulation" }, connection);
      const access = await tfdRequestForActor(db, restricted, request.id);
      assert.equal(access.patient.person.fullName, "Paciente titular"); assert.ok(access.createdAt instanceof Date);
      const race = await Promise.allSettled([authorizeTfdRequest(context, request.id, connection), authorizeTfdRequest(context, request.id, connection)]);
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      assert.equal((await db.select().from(t.healthTfdRequestEvents).where(and(eq(t.healthTfdRequestEvents.requestId, request.id), eq(t.healthTfdRequestEvents.eventType, "AUTORIZACAO")))).length, 1);
    });

    await suite.test("laudo exige profissional, unidade e prontuário corretos; versões e PDFs são congelados", async () => {
      const request = await createTfdRequest(context, requestInput, connection), input = tfdClinicalInput(request.id);
      await assert.rejects(saveTfdClinicalReport(tfdTestContext({ employeeId: null }), input, connection), /profissional de Saúde autenticado/);
      await assert.rejects(saveTfdClinicalReport(context, { ...input, medicalRecordId: "tfd-wrong-record" }, connection), /Prontuário/);
      await assert.rejects(saveTfdClinicalReport(context, { ...input, companionJustification: null }, connection), /acompanhante/);
      await db.update(healthProfessionals).set({ unitId: "tfd-u2" }).where(eq(healthProfessionals.id, "tfd-professional"));
      await assert.rejects(saveTfdClinicalReport(context, input, connection), /vínculo vigente/);
      const [assignment] = await db.insert(healthProfessionalAssignments).values({ professionalId: "tfd-professional", unitId: "tfd-u1", validFrom: new Date("2000-01-01"), validUntil: new Date("2099-01-01") }).returning();
      await f.database.exec(`CREATE TRIGGER tfd_fail_revision BEFORE INSERT ON "HealthTfdReportRevision" FOR EACH ROW EXECUTE FUNCTION tfd_fail_event();`);
      try { await assert.rejects(saveTfdClinicalReport(context, input, connection), isInjectedTfdEventFailure); }
      finally { await f.database.exec(`DROP TRIGGER tfd_fail_revision ON "HealthTfdReportRevision";`); }
      assert.equal((await db.select().from(t.healthTfdClinicalReports).where(eq(t.healthTfdClinicalReports.requestId, request.id))).length, 0);
      const first = await saveTfdClinicalReport(context, input, connection);
      assert.deepEqual(Object.keys(first).sort(), ["id", "requestId", "version"]);
      await assert.rejects(saveTfdClinicalReport(context, input, connection), /outra sessão/);
      await assert.rejects(authorizeTfdRequest(context, request.id, connection), /aprovado/);
      await addTfdReportSupplement(context, { requestId: request.id, narrative: "Complemento após avaliação médica" }, connection);
      const [revision] = await db.select().from(t.healthTfdReportRevisions).where(eq(t.healthTfdReportRevisions.reportId, first.id));
      assert.ok(revision.createdAt instanceof Date);
      await db.update(people).set({ fullName: "Nome atual alterado" }).where(eq(people.id, "tfd-person"));
      await transitionTfdClinicalRequest(context, { requestId: request.id, status: "GLOSADA", reason: "Complementar dados clínicos" }, connection);
      const second = await saveTfdClinicalReport(context, { ...input, expectedVersion: 1, treatment: "Tratamento complementado" }, connection);
      assert.equal(second.version, 2);
      assert.deepEqual((await db.select().from(t.healthTfdReportRevisions).where(eq(t.healthTfdReportRevisions.id, revision.id)))[0], revision);
      assert.ok((await PdfReader.load(await tfdPatientDocument(context, request.id, "LAUDO", 1, connection))).getPageCount() > 0);
      await transitionTfdClinicalRequest(context, { requestId: request.id, status: "APROVADA", reason: "Laudo revisado aprovado" }, connection);
      await authorizeTfdRequest(context, request.id, connection);
      await assert.rejects(tfdPatientDocument(context, request.id, "PEDIDO", 1, connection), /versão autorizada atual/);
      assert.ok((await PdfReader.load(await tfdPatientDocument(context, request.id, "PEDIDO", undefined, connection))).getPageCount() > 0);
      await assert.rejects(tfdPatientDocument(tfdTestContext({ hasHealthAccessScope: true, allowedHealthUnitIds: ["tfd-u2"] }), request.id, "LAUDO", 1, connection), /acesso/i);
      await db.delete(healthProfessionalAssignments).where(eq(healthProfessionalAssignments.id, assignment.id));
      await db.update(healthProfessionals).set({ unitId: "tfd-u1" }).where(eq(healthProfessionals.id, "tfd-professional"));
      await db.update(people).set({ fullName: "Paciente titular" }).where(eq(people.id, "tfd-person"));
    });

    await suite.test("benefícios preservam numeric(14,2), entrega única, recebedor e anulação seletiva", async () => {
      const request = await createTfdRequest(context, requestInput, connection);
      await saveTfdClinicalReport(context, tfdClinicalInput(request.id), connection);
      await transitionTfdClinicalRequest(context, { requestId: request.id, status: "APROVADA", reason: "Aprovação fundamentada" }, connection);
      await authorizeTfdRequest(context, request.id, connection);
      await f.database.exec(`CREATE TRIGGER tfd_fail_benefit_event BEFORE INSERT ON "HealthTfdRequestEvent" FOR EACH ROW EXECUTE FUNCTION tfd_fail_event();`);
      try { await assert.rejects(requestTfdBenefit(context, { requestId: request.id, kind: "PASSAGEM", description: "Benefício com falha no evento", quantity: 1, unitValue: "0.01" }, connection), isInjectedTfdEventFailure); }
      finally { await f.database.exec(`DROP TRIGGER tfd_fail_benefit_event ON "HealthTfdRequestEvent";`); }
      assert.equal((await db.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.requestId, request.id))).length, 0);
      const benefit = await requestTfdBenefit(context, { requestId: request.id, kind: "HOSPEDAGEM", description: "Hospedagem durante tratamento", quantity: 2, unitValue: "999999999999.99" }, connection);
      const [record] = await db.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.id, benefit.id));
      assert.ok(record.unitValue instanceof Decimal); assert.equal(record.unitValue.toFixed(2), "999999999999.99");
      const race = await Promise.allSettled([transitionTfdBenefit(context, { benefitId: benefit.id, status: "AUTORIZADO", reason: "Benefício autorizado" }, connection), transitionTfdBenefit(context, { benefitId: benefit.id, status: "AUTORIZADO", reason: "Repetição concorrente" }, connection)]);
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      await assert.rejects(transitionTfdBenefit(context, { benefitId: benefit.id, status: "ENTREGUE", reason: "Entrega sem recebedor" }, connection), /recebedora/);
      await transitionTfdBenefit(context, { benefitId: benefit.id, status: "ENTREGUE", reason: "Entrega ao titular", receivedByPersonId: "tfd-person", deliveryReceipt: "TFD-RECIBO-1" }, connection);
      await assert.rejects(transitionTfdBenefit(context, { benefitId: benefit.id, status: "ENTREGUE", reason: "Repetição da entrega", receivedByPersonId: "tfd-person", deliveryReceipt: "TFD-RECIBO-1" }, connection), /não permitida/);
      const pending = await requestTfdBenefit(context, { requestId: request.id, kind: "PASSAGEM", description: "Passagem de retorno", quantity: 1, unitValue: null }, connection);
      assert.equal((await db.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.id, pending.id)))[0].unitValue, null);
      await transitionTfdClinicalRequest(context, { requestId: request.id, status: "CANCELADA", reason: "Cancelamento solicitado pelo titular" }, connection);
      assert.equal((await db.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.id, benefit.id)))[0].status, "ENTREGUE");
      assert.equal((await db.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.id, pending.id)))[0].status, "CANCELADO");
      await assert.rejects(addTfdReportSupplement(context, { requestId: request.id, narrative: "Complemento tardio indevido" }, connection), /encerrado/);
      await assert.rejects(tfdPatientDocument(context, request.id, "PEDIDO", undefined, connection), /autorizado/);
      await transitionTfdClinicalRequest(context, { requestId: request.id, status: "ARQUIVADA", reason: "Arquivamento documentado" }, connection);
      const rows = await tfdProcessReport(context, { unitId: "tfd-u1", destination: "REGIONAL", professionalId: "tfd-professional", procedureId: "tfd-procedure" }, db);
      const report = rows.find(row => row.Processo === request.id);
      assert.ok(report); assert.equal(report["Benefícios entregues"], 1); assert.equal(report.Situação, "ARQUIVADA");
      assert.deepEqual(Object.keys(report), ["Processo", "Data", "Paciente", "Unidade solicitante", "Destino", "Profissional", "Procedimento", "Diagnóstico", "Versão", "Situação", "Autorização", "Benefícios autorizados", "Benefícios entregues"]);
      await assert.rejects(tfdProcessReport(restricted, { unitId: "tfd-u2" }, db), /acesso/i);
    });

    await suite.test("capacidade concorrente, transferência e dupla custódia preservam histórico e sigilo", async () => {
      const source = await createTfdTrip(context, { ...tripInput, capacity: 1 }, connection), target = await createTfdTrip(context, tripInput, connection);
      const race = await Promise.allSettled([addPassenger(context, { tripId: source.id, patientId: "tfd-patient" }, connection), addPassenger(context, { tripId: source.id, patientId: "tfd-patient2" }, connection)]);
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      const [passenger] = await db.select().from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.tripId, source.id));
      await requestPassengerRemoval(context, passenger.id, connection);
      await f.database.exec(`CREATE TRIGGER tfd_fail_transfer_event BEFORE INSERT ON "HealthTfdTripEvent" FOR EACH ROW EXECUTE FUNCTION tfd_fail_event();`);
      try { await assert.rejects(movePassenger(context, passenger.id, target.id, connection), isInjectedTfdEventFailure); }
      finally { await f.database.exec(`DROP TRIGGER tfd_fail_transfer_event ON "HealthTfdTripEvent";`); }
      assert.equal((await db.select().from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passenger.id)))[0].tripId, source.id);
      await movePassenger(context, passenger.id, target.id, connection);
      assert.equal((await db.select().from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passenger.id)))[0].presenceStatus, "PENDING");
      await assert.rejects(confirmPassengerRemoval(context, passenger.id, true, connection), /segundo usuário/);
      await confirmPassengerRemoval(tfdTestContext({ id: "tfd-second" }), passenger.id, true, connection);
      assert.equal((await db.select().from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.tripId, target.id), activeTfdPassengerWhere))).length, 0);
      await assert.rejects(addPassenger(context, { tripId: target.id, patientId: passenger.patientId }, connection), /histórico de exclusões/);
      const emptyOther = await createTfdTrip(tfdTestContext({ id: "tfd-second" }), tripInput, connection);
      assert.equal(await readTfdTrip(db, restricted.user, emptyOther.id), null);
      const hidden = await createTfdTrip(context, tripInput, connection);
      const foreign = await addPassenger(context, { tripId: hidden.id, patientId: "tfd-patient2" }, connection);
      assert.equal(await readTfdTrip(db, restricted.user, hidden.id), null);
      await requestPassengerRemoval(context, foreign.id, connection);
      await confirmPassengerRemoval(tfdTestContext({ id: "tfd-second" }), foreign.id, true, connection);
      assert.equal(await readTfdTrip(db, restricted.user, hidden.id), null, "removidos continuam no universo de acesso");
      const unassigned = await createTfdTrip(context, tripInput, connection);
      await addPassenger(context, { tripId: unassigned.id, patientId: "tfd-patient3" }, connection);
      assert.equal(await readTfdTrip(db, restricted.user, unassigned.id), null, "SQL NULL não satisfaz every");
      assert.equal((await db.select({ total: count() }).from(t.healthTfdTrips).where(and(eq(t.healthTfdTrips.id, hidden.id), tfdTripAccessWhere(restricted.user))))[0].total, 0);
      const legacy = await createTfdTrip(context, tripInput, connection);
      assert.equal((await db.select().from(t.healthTfdTrips).where(eq(t.healthTfdTrips.id, legacy.id)))[0].date.toISOString(), "2026-10-28T00:00:00.000Z");
      await updateTripStatus(context, legacy.id, "EMBARCANDO", connection);
      await updateTripStatus(context, legacy.id, "EMBARCANDO", connection);
      assert.equal((await db.select().from(t.healthTfdTripEvents).where(eq(t.healthTfdTripEvents.tripId, legacy.id))).length, 1);
    });

    await suite.test("Fleet e TFD usam origem real, acompanhante obrigatório e rollback de saída/retorno", async () => {
      const scope = healthTransportFleetScope(context);
      const booking = await withDatabaseTransaction(connection, tx => createFleetBooking(tx, scope, { unitId: "tfd-vehicle", driverId: "tfd-driver", routeId: "tfd-route", kind: "VIAGEM", purpose: "Transporte de tratamento autorizado", startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() }));
      const bridge = { bookingId: booking.id, capacity: 2, assistantEmployeeId: null, responsibleEmployeeId: "tfd-driver-employee", advanceRequestId: null };
      await assert.rejects(createTfdTripFromBooking(tfdTestContext({ departmentId: "tfd-other-department" }), bridge, connection), /setor|repartição/);
      const race = await Promise.allSettled([createTfdTripFromBooking(context, bridge, connection), createTfdTripFromBooking(context, bridge, connection)]);
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      const [trip] = await db.select().from(t.healthTfdTrips).where(eq(t.healthTfdTrips.fleetBookingId, booking.id));
      const request = await createTfdRequest(context, requestInput, connection);
      await saveTfdClinicalReport(context, tfdClinicalInput(request.id), connection);
      await transitionTfdClinicalRequest(context, { requestId: request.id, status: "APROVADA", reason: "Tratamento aprovado" }, connection);
      await authorizeTfdRequest(context, request.id, connection);
      const patient = await addPassenger(context, { tripId: trip.id, patientId: "tfd-patient", tfdRequestId: request.id }, connection);
      const companion = await addPassenger(context, { tripId: trip.id, patientId: "tfd-patient", tfdRequestId: request.id, kind: "ACOMPANHANTE", companionName: "Familiar responsável" }, connection);
      await assert.rejects(transitionTfdClinicalRequest(context, { requestId: request.id, status: "CANCELADA", reason: "Tentativa com viagem ativa" }, connection), /Remova os passageiros/);
      await assert.rejects(updateTripStatus(context, trip.id, "EMBARCANDO", connection), /Confirme/);
      await confirmTfdTrip(context, { tripId: trip.id, reason: "Viagem conferida e confirmada" }, connection);
      await updateTripStatus(context, trip.id, "EMBARCANDO", connection);
      await recordTfdPassengerBoarding(context, { passengerId: patient.id, boardingLocation: "Recepção", presenceStatus: "BOARDED", reason: "Paciente presente" }, connection);
      await recordTfdPassengerBoarding(context, { passengerId: companion.id, boardingLocation: "Recepção", presenceStatus: "ABSENT", reason: "Acompanhante ausente" }, connection);
      const depart = { unitId: "tfd-vehicle", driverId: "tfd-driver", bookingId: booking.id, routeId: "tfd-route", destination: "Hospital regional", purpose: "Transporte do paciente titular", reading: "" };
      await assert.rejects(withDatabaseTransaction(connection, tx => departFleetTrip(tx, scope, depart)), /acompanhante/);
      assert.equal((await db.select().from(fleetTrips).where(eq(fleetTrips.bookingId, booking.id))).length, 0);
      assert.equal((await db.select().from(fleetBookings).where(eq(fleetBookings.id, booking.id)))[0].status, "AGENDADO");
      await recordTfdPassengerBoarding(context, { passengerId: companion.id, boardingLocation: "Recepção", presenceStatus: "BOARDED", reason: "Acompanhante presente" }, connection);
      await assert.rejects(withDatabaseTransaction(connection, async tx => { await departFleetTrip(tx, scope, depart); throw new Error("injected Fleet rollback"); }), /injected Fleet rollback/);
      assert.equal((await db.select().from(fleetTrips).where(eq(fleetTrips.bookingId, booking.id))).length, 0);
      const movement = await withDatabaseTransaction(connection, tx => departFleetTrip(tx, scope, depart));
      await assert.rejects(recordTfdPassengerBoarding(context, { passengerId: patient.id, boardingLocation: "Outro local", presenceStatus: "ABSENT", reason: "Tentativa após saída" }, connection), /encerrado/);
      await updateTripStatus(context, trip.id, "EM_TRANSITO", connection);
      const [origin] = await db.select().from(fleetTrips).where(eq(fleetTrips.id, movement.id));
      assert.equal((await db.select().from(t.healthTfdTrips).where(eq(t.healthTfdTrips.id, trip.id)))[0].departureAt?.toISOString(), origin.departedAt.toISOString());
      await assert.rejects(updateTripStatus(context, trip.id, "CONCLUIDA", connection), /retorno em Frotas/);
      await assert.rejects(withDatabaseTransaction(connection, async tx => { await arriveFleetTrip(tx, scope, { tripId: movement.id, reading: "", reason: "Retorno documentado" }); throw new Error("injected return rollback"); }), /injected return rollback/);
      assert.equal((await db.select().from(fleetUsages).where(eq(fleetUsages.tripId, movement.id))).length, 0);
      await withDatabaseTransaction(connection, tx => arriveFleetTrip(tx, scope, { tripId: movement.id, reading: "", reason: "Retorno documentado" }));
      await updateTripStatus(context, trip.id, "CONCLUIDA", connection);
      const [returned] = await db.select().from(fleetTrips).where(eq(fleetTrips.id, movement.id));
      assert.equal((await db.select().from(t.healthTfdTrips).where(eq(t.healthTfdTrips.id, trip.id)))[0].returnAt?.toISOString(), returned.returnedAt?.toISOString());
      assert.equal((await db.select().from(fleetUsages).where(eq(fleetUsages.tripId, movement.id))).length, 1);
      assert.equal((await db.select().from(fleetGateEvents).where(eq(fleetGateEvents.tripId, movement.id))).length, 2);
      assert.ok((await PdfReader.load(await tfdTripDocument(context, trip.id, db))).getPageCount() > 0);
    });

    await suite.test("adiantamento mantém origem RH, UG, valor exato e JSON null distinto de SQL NULL", async () => {
      const [booking] = await db.insert(fleetBookings).values({ unitId: "tfd-vehicle", driverId: "tfd-driver", routeId: "tfd-route", kind: "VIAGEM", purpose: "Transporte com adiantamento", startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), createdById: context.user.id }).returning();
      const [advance] = await db.insert(hrPortalRequests).values({ employeeId: "tfd-driver-employee", requestKey: "tfd-advance", kind: "ADIANTAMENTO", status: "DEFERIDA", actorId: context.user.id, payload: { scope: "PRODUCAO", input: { budgetUnitId: "tfd-budget" }, assessment: { amountBRL: "999999999999.99" } } }).returning();
      const input = { bookingId: booking.id, capacity: 2, assistantEmployeeId: null, responsibleEmployeeId: "tfd-driver-employee", advanceRequestId: advance.id };
      await assert.rejects(createTfdTripFromBooking(tfdTestContext({ modulePermissions: [{ code: "SAUDE", canView: true, canEdit: true }] }), input, connection), /autorização RH/);
      await assert.rejects(createTfdTripFromBooking(tfdTestContext({ allowedBudgetUnitIds: [] }), input, connection), /Unidade Gestora/);
      const trip = await createTfdTripFromBooking(context, input, connection);
      const [record] = await db.select().from(t.healthTfdTrips).where(eq(t.healthTfdTrips.id, trip.id));
      assert.equal(record.advanceRequestId, advance.id); assert.equal(record.advanceAuthorizedAmount?.toFixed(2), "999999999999.99");
      assert.equal((await db.select().from(hrPortalRequests).where(eq(hrPortalRequests.id, advance.id))).length, 1);
      const [sqlNull] = await db.insert(t.healthTfdTripEvents).values({ tripId: trip.id, eventType: "TEST_SQL_NULL", reason: "Metadata ausente", actorUsuarioId: context.user.id }).returning();
      const [jsonNull] = await db.insert(t.healthTfdTripEvents).values({ tripId: trip.id, eventType: "TEST_JSON_NULL", reason: "Metadata JSON null", metadata: JsonNull, actorUsuarioId: context.user.id }).returning();
      assert.equal(sqlNull.metadata, null); assert.equal(jsonNull.metadata, null);
      const raw = await db.execute<{ id: string; isSqlNull: boolean; metadataType: string | null; createdAt: string }>(sql`select id, metadata is null as "isSqlNull", jsonb_typeof(metadata) as "metadataType", "createdAt" from "HealthTfdTripEvent" where id in (${sqlNull.id}, ${jsonNull.id})`);
      assert.equal(raw.rows.find(row => row.id === sqlNull.id)?.isSqlNull, true);
      assert.equal(raw.rows.find(row => row.id === jsonNull.id)?.metadataType, "null");
      assert.equal(raw.rows.find(row => row.id === jsonNull.id)?.isSqlNull, false);
      assert.equal(databaseTimestamp(raw.rows[0].createdAt).toISOString(), (raw.rows[0].id === sqlNull.id ? sqlNull : jsonNull).createdAt.toISOString());
    });
  } finally { await f.close(); }
});
