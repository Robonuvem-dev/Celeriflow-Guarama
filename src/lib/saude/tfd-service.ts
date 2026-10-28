import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import type { HealthTfdContext as AppContext } from "@/lib/contracts/health-tfd";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import * as t from "@/db/schema/health-tfd";
import { patients } from "@/db/schema/health-registration";
import { healthRegulationRequests } from "@/db/schema/health-regulation";
import { fleetUnits, fleetBookings, fleetTrips } from "@/db/schema/fleet";
import { employees } from "@/db/schema/administration";
import { activeTfdPassengerWhere, lockTfdTrips, readTfdBoardingPassengers, readTfdTrip, requiredTfdRecord } from "@/db/repositories/health-tfd/records";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { lockTfdRequest, tfdRequestForActor } from "./tfd-clinical-service";
import { assertTfdBoardingReady } from "./tfd-transport-policy";

export class TfdError extends Error {}

export { activeTfdPassengerWhere, tfdTripAccessWhere } from "@/db/repositories/health-tfd/records";

function assertTripEditable(status: string) {
  if (!["PLANEJADA", "EMBARCANDO"].includes(status)) {
    throw new TfdError("Passageiros só podem ser alterados antes da saída da viagem.");
  }
}

async function assertNoFleetDeparture(tx: DatabaseTransaction, bookingId: string | null) {
  if (bookingId && (await tx.select({ id: fleetTrips.id }).from(fleetTrips).where(eq(fleetTrips.bookingId, bookingId)).limit(1))[0]) throw new TfdError("A saída já foi registrada em Frotas; o manifesto de passageiros está encerrado.");
}

async function assertPassengerAccess(context: AppContext, tx: DatabaseTransaction, patientId: string, requestId?: string | null) {
  const [patient] = await tx.select({ referenceUnitId: patients.referenceUnitId }).from(patients).where(eq(patients.id, patientId)).limit(1);
  if (!patient) throw new TfdError("Paciente não encontrado.");
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  else if (context.user.hasHealthAccessScope) throw new TfdError("Paciente sem unidade de referência acessível.");
  if (requestId) {
    const [request] = await tx.select({ patientId: t.healthTfdRequests.patientId, originUnitId: t.healthTfdRequests.originUnitId, status: t.healthTfdRequests.status }).from(t.healthTfdRequests).where(eq(t.healthTfdRequests.id, requestId)).limit(1);
    if (!request || request.patientId !== patientId) throw new TfdError("Solicitação TFD não pertence ao paciente.");
    if (request.originUnitId) assertHealthUnitAccess(context.user, request.originUnitId);
    if (!["AUTORIZADA", "AGENDADA"].includes(request.status)) throw new TfdError("O transporte exige solicitação TFD autorizada.");
  }
}

const requestSchema = z.object({
  patientId: z.string().min(1),
  regulationRequestId: z.string().min(1).nullable().optional(),
  originUnitId: z.string().min(1).nullable().optional(),
  destination: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(3).max(2000),
  priority: z.enum(["Alta","Media","Normal"]).default("Normal"),
  companionName: z.string().trim().max(120).nullable().optional(),
  companionDocument: z.string().trim().max(30).nullable().optional(),
}).strict();

const tripSchema = z.object({
  date: z.iso.date(),
  origin: z.string().trim().min(2).max(200),
  destination: z.string().trim().min(2).max(200),
  fleetUnitId: z.string().min(1),
  driverEmployeeId: z.string().min(1).nullable().optional(),
  capacity: z.number().int().positive().max(100),
}).strict();

export async function createTfdRequest(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = requestSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    if (input.originUnitId) assertHealthUnitAccess(context.user, input.originUnitId);
    const [patient] = await tx.select({ id: patients.id, referenceUnitId: patients.referenceUnitId }).from(patients).where(eq(patients.id, input.patientId)).limit(1);
    if (!patient) throw new TfdError("Paciente não encontrado.");
    if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
    else if (context.user.hasHealthAccessScope) throw new TfdError("Paciente sem unidade de referência acessível.");
    if (context.user.hasHealthAccessScope && !input.originUnitId) throw new TfdError("Informe a unidade de origem da solicitação.");
    if (input.regulationRequestId) {
      const [regulation] = await tx.select({ patientId: healthRegulationRequests.patientId, requestUnitId: healthRegulationRequests.requestUnitId }).from(healthRegulationRequests).where(eq(healthRegulationRequests.id, input.regulationRequestId)).limit(1);
      if (!regulation || regulation.patientId !== input.patientId) throw new TfdError("Regulação não pertence ao paciente.");
      if (regulation.requestUnitId) assertHealthUnitAccess(context.user, regulation.requestUnitId);
    }
    const result = requiredTfdRecord((await tx.insert(t.healthTfdRequests).values({
      patientId: input.patientId,
      regulationRequestId: input.regulationRequestId || null,
      originUnitId: input.originUnitId || null,
      destination: input.destination,
      reason: input.reason,
      priority: input.priority,
      companionName: input.companionName || null,
      companionDocument: input.companionDocument || null,
      createdByUsuarioId: context.user.id,
    }).returning({ id: t.healthTfdRequests.id }))[0]);
    await tx.insert(t.healthTfdRequestEvents).values({ requestId: result.id, eventType: "SOLICITACAO", toStatus: "SOLICITADA", reason: input.reason, actorUsuarioId: context.user.id });
    return result;
  });
}

export async function authorizeTfdRequest(context: AppContext, id: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdRequest(tx, id);
    const req = await tfdRequestForActor(tx, context, id);
    if (req.clinicalReport ? req.status !== "APROVADA" : req.status !== "SOLICITADA") throw new TfdError("O laudo deve estar aprovado antes da autorização; solicitações simples devem estar pendentes.");
    await tx.update(t.healthTfdRequests).set({ status: "AUTORIZADA", authorizedAt: new Date() }).where(eq(t.healthTfdRequests.id, id));
    await tx.insert(t.healthTfdRequestEvents).values({ requestId: id, eventType: "AUTORIZACAO", fromStatus: req.status, toStatus: "AUTORIZADA", reportVersion: req.clinicalReport?.version, reason: "Tratamento autorizado pelo usuário responsável.", actorUsuarioId: context.user.id });
    return { id };
  });
}

export async function createTfdTrip(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = tripSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const [fleet] = await tx.select({ id: fleetUnits.id }).from(fleetUnits).where(eq(fleetUnits.id, input.fleetUnitId)).limit(1);
    if (!fleet) throw new TfdError("Veículo não encontrado. Use um veículo do módulo Frotas.");
    if (input.driverEmployeeId) {
      const [driver] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, input.driverEmployeeId)).limit(1);
      if (!driver) throw new TfdError("Condutor não encontrado.");
    }
    return requiredTfdRecord((await tx.insert(t.healthTfdTrips).values({
      date: new Date(`${input.date}T12:00:00`),
      origin: input.origin,
      destination: input.destination,
      fleetUnitId: input.fleetUnitId,
      driverEmployeeId: input.driverEmployeeId || null,
      capacity: input.capacity,
      createdByUsuarioId: context.user.id,
    }).returning({ id: t.healthTfdTrips.id }))[0]);
  });
}

export async function addPassenger(context: AppContext, input: { tripId: string; patientId: string; tfdRequestId?: string | null; companionName?: string | null; companionDocument?: string | null; kind?: string }, connection: DatabaseConnection = databaseConnection) {
  if (input.kind && !["PACIENTE", "ACOMPANHANTE"].includes(input.kind)) throw new TfdError("Tipo de passageiro inválido.");
  const kind = input.kind === "ACOMPANHANTE" ? "ACOMPANHANTE" : "PACIENTE";
  if (kind === "ACOMPANHANTE" && !input.companionName?.trim()) throw new TfdError("Informe o nome do acompanhante.");
  return withDatabaseTransaction(connection, async tx => {
    if (input.tfdRequestId) await lockTfdRequest(tx, input.tfdRequestId);
    await lockTfdTrips(tx, [input.tripId]);
    const trip = await readTfdTrip(tx, context.user, input.tripId);
    if (!trip) throw new TfdError("Viagem não encontrada.");
    assertTripEditable(trip.status);
    await assertNoFleetDeparture(tx, trip.fleetBookingId);
    await assertPassengerAccess(context, tx, input.patientId, input.tfdRequestId);
    const [existing] = await tx.select({ id: t.healthTfdPassengers.id }).from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.tripId, input.tripId), eq(t.healthTfdPassengers.patientId, input.patientId), eq(t.healthTfdPassengers.kind, kind))).limit(1);
    if (existing) throw new TfdError("Passageiro já registrado nesta viagem, inclusive no histórico de exclusões.");
    const [capacity] = await tx.select({ used: count() }).from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.tripId, input.tripId), activeTfdPassengerWhere));
    if (capacity.used >= trip.capacity) throw new TfdError("Capacidade do veículo atingida.");
    // companionName distinguishes companion row, but patientId+kind unique prevents duplicate
    const passenger = requiredTfdRecord((await tx.insert(t.healthTfdPassengers).values({
        tripId: input.tripId,
        patientId: input.patientId,
        tfdRequestId: input.tfdRequestId || null,
        companionName: input.companionName || null,
        companionDocument: input.companionDocument || null,
        kind,
      }).returning({ id: t.healthTfdPassengers.id }))[0]);
    await tx.insert(t.healthTfdTripEvents).values({ tripId: trip.id, passengerId: passenger.id, eventType: "INTEGRANTE_INCLUIDO", reason: `${kind} incluído no transporte.`, metadata: { patientId: input.patientId, tfdRequestId: input.tfdRequestId || null }, actorUsuarioId: context.user.id });
    return passenger;
  });
}

export async function movePassenger(context: AppContext, passengerId: string, targetTripId: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    const [passenger] = await tx.select().from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passengerId)).limit(1);
    if (!passenger) throw new TfdError("Passageiro não encontrado.");
    if (passenger.tfdRequestId) await lockTfdRequest(tx, passenger.tfdRequestId);
    await lockTfdTrips(tx, [passenger.tripId, targetTripId]);
    const [current] = await tx.select().from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.id, passengerId), activeTfdPassengerWhere)).limit(1);
    if (!current || current.tripId !== passenger.tripId) throw new TfdError("Passageiro alterado por outra operação. Atualize a página.");
    const source = await readTfdTrip(tx, context.user, current.tripId);
    const target = await readTfdTrip(tx, context.user, targetTripId);
    if (!source) throw new TfdError("Viagem de origem fora do escopo de acesso.");
    if (!target) throw new TfdError("Viagem destino não encontrada.");
    assertTripEditable(source.status);
    assertTripEditable(target.status);
    await assertNoFleetDeparture(tx, source.fleetBookingId);
    await assertNoFleetDeparture(tx, target.fleetBookingId);
    await assertPassengerAccess(context, tx, current.patientId, current.tfdRequestId);
    if (current.tripId === targetTripId) return { id: current.id };
    const [capacity] = await tx.select({ used: count() }).from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.tripId, targetTripId), activeTfdPassengerWhere));
    if (capacity.used >= target.capacity) throw new TfdError("Capacidade da viagem destino atingida.");
    const result = requiredTfdRecord((await tx.update(t.healthTfdPassengers).set({ tripId: targetTripId, presenceStatus: "PENDING", presenceAt: null, presenceByUsuarioId: null }).where(eq(t.healthTfdPassengers.id, passengerId)).returning({ id: t.healthTfdPassengers.id }))[0]);
    for (const tripId of [source.id, target.id]) await tx.insert(t.healthTfdTripEvents).values({ tripId, passengerId, eventType: "TRANSFERENCIA", reason: `Transferência de ${source.id} para ${target.id}.`, metadata: { fromTripId: source.id, toTripId: target.id, previousPresenceStatus: current.presenceStatus }, actorUsuarioId: context.user.id });
    return result;
  });
}

export async function requestPassengerRemoval(context: AppContext, passengerId: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    const [passenger] = await tx.select({ tripId: t.healthTfdPassengers.tripId }).from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passengerId)).limit(1);
    if (!passenger) throw new TfdError("Passageiro não encontrado.");
    await lockTfdTrips(tx, [passenger.tripId]);
    const [current] = await tx.select().from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passengerId)).limit(1);
    if (!current || current.tripId !== passenger.tripId) throw new TfdError("Passageiro alterado por outra operação. Atualize a página.");
    const trip = await readTfdTrip(tx, context.user, current.tripId);
    if (!trip) throw new TfdError("Viagem fora do escopo de acesso.");
    assertTripEditable(trip.status);
    await assertNoFleetDeparture(tx, trip.fleetBookingId);
    await assertPassengerAccess(context, tx, current.patientId);
    const [existing] = await tx.select({ status: t.healthTfdPassengerRemovals.status }).from(t.healthTfdPassengerRemovals).where(eq(t.healthTfdPassengerRemovals.passengerId, passengerId)).limit(1);
    if (existing?.status === "Pendente") throw new TfdError("Já existe pedido de exclusão pendente.");
    if (existing?.status === "Confirmada") throw new TfdError("Passageiro já excluído da viagem.");
    const result = requiredTfdRecord((await tx.insert(t.healthTfdPassengerRemovals).values({ passengerId, requestedByUsuarioId: context.user.id }).onConflictDoUpdate({ target: t.healthTfdPassengerRemovals.passengerId, set: { requestedByUsuarioId: context.user.id, confirmedByUsuarioId: null, status: "Pendente" } }).returning({ id: t.healthTfdPassengerRemovals.id }))[0]);
    await tx.insert(t.healthTfdTripEvents).values({ tripId: current.tripId, passengerId, eventType: "EXCLUSAO_SOLICITADA", reason: "Exclusão solicitada para confirmação por segundo usuário.", actorUsuarioId: context.user.id });
    return result;
  });
}

// Dupla custódia: a confirmação exige usuário diferente do solicitante.
export async function confirmPassengerRemoval(context: AppContext, passengerId: string, approve: boolean, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    const [passenger] = await tx.select({ tripId: t.healthTfdPassengers.tripId }).from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passengerId)).limit(1);
    if (!passenger) throw new TfdError("Passageiro não encontrado.");
    await lockTfdTrips(tx, [passenger.tripId]);
    const [current] = await tx.select().from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, passengerId)).limit(1);
    if (!current || current.tripId !== passenger.tripId) throw new TfdError("Passageiro alterado por outra operação. Atualize a página.");
    const trip = await readTfdTrip(tx, context.user, current.tripId);
    if (!trip) throw new TfdError("Viagem fora do escopo de acesso.");
    assertTripEditable(trip.status);
    await assertNoFleetDeparture(tx, trip.fleetBookingId);
    await assertPassengerAccess(context, tx, current.patientId);
    const [removal] = await tx.select().from(t.healthTfdPassengerRemovals).where(eq(t.healthTfdPassengerRemovals.passengerId, passengerId)).limit(1);
    if (!removal || removal.status !== "Pendente") throw new TfdError("Pedido de exclusão não está pendente.");
    if (removal.requestedByUsuarioId === context.user.id) throw new TfdError("A confirmação exige um segundo usuário (dupla custódia).");
    const result = requiredTfdRecord((await tx.update(t.healthTfdPassengerRemovals).set({ status: approve ? "Confirmada" : "Cancelada", confirmedByUsuarioId: context.user.id }).where(eq(t.healthTfdPassengerRemovals.id, removal.id)).returning({ id: t.healthTfdPassengerRemovals.id }))[0]);
    await tx.insert(t.healthTfdTripEvents).values({ tripId: current.tripId, passengerId, eventType: approve ? "EXCLUSAO_CONFIRMADA" : "EXCLUSAO_RECUSADA", reason: "Decisão do segundo usuário sobre a exclusão do integrante.", metadata: { requestedByUsuarioId: removal.requestedByUsuarioId }, actorUsuarioId: context.user.id });
    return result;
  });
}

export async function updateTripStatus(context: AppContext, tripId: string, status: string, connection: DatabaseConnection = databaseConnection) {
  const allowed: Record<string, string[]> = {
    PLANEJADA: ["EMBARCANDO","CANCELADA"],
    EMBARCANDO: ["EM_TRANSITO","CANCELADA"],
    EM_TRANSITO: ["RETORNANDO","CONCLUIDA"],
    RETORNANDO: ["CONCLUIDA"],
  };
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdTrips(tx, [tripId]);
    const trip = await readTfdTrip(tx, context.user, tripId);
    if (!trip) throw new TfdError("Viagem não encontrada.");
    const passengers = await readTfdBoardingPassengers(tx, tripId);
    for (const passenger of passengers) await assertPassengerAccess(context, tx, passenger.patientId);
    if (trip.status === status) return { id: trip.id, status: trip.status };
    if (!allowed[trip.status]?.includes(status)) throw new TfdError(`Transição de ${trip.status} para ${status} não permitida.`);
    const data: Partial<typeof t.healthTfdTrips.$inferInsert> = { status };
    if (status === "EM_TRANSITO") data["departureAt"] = new Date();
    if (status === "CONCLUIDA") data["returnAt"] = new Date();
    if (trip.fleetBookingId) {
      const booking = requiredTfdRecord((await tx.select().from(fleetBookings).where(eq(fleetBookings.id, trip.fleetBookingId)).limit(1))[0]);
      if (status === "EMBARCANDO" && (!trip.confirmedAt || booking.status !== "AGENDADO")) throw new TfdError("Confirme o transporte e mantenha a agenda de Frotas disponível antes do embarque.");
      if (status === "CANCELADA" && booking.status !== "CANCELADO") throw new TfdError("Cancele a agenda de origem em Frotas antes de cancelar o transporte.");
      if (["EM_TRANSITO", "RETORNANDO", "CONCLUIDA"].includes(status)) {
        const [movement] = await tx.select().from(fleetTrips).where(eq(fleetTrips.bookingId, trip.fleetBookingId)).limit(1);
        if (!movement) throw new TfdError("Registre a saída na guarita de Frotas antes de movimentar o transporte.");
        if (status === "EM_TRANSITO") {
          assertTfdBoardingReady(passengers);
          data["departureAt"] = movement.departedAt;
        }
        if (status === "CONCLUIDA") {
          if (!movement.returnedAt) throw new TfdError("Registre o retorno em Frotas antes de concluir o transporte.");
          data["returnAt"] = movement.returnedAt;
        }
      }
    }
    const result = requiredTfdRecord((await tx.update(t.healthTfdTrips).set(data).where(eq(t.healthTfdTrips.id, tripId)).returning({ id: t.healthTfdTrips.id, status: t.healthTfdTrips.status }))[0]);
    await tx.insert(t.healthTfdTripEvents).values({ tripId, eventType: "SITUACAO", reason: `${trip.status} → ${status}`, actorUsuarioId: context.user.id });
    return result;
  });
}
