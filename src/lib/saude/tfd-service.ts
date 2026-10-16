import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { lockTfdRequest, tfdRequestForActor } from "./tfd-clinical-service";
import { assertTfdBoardingReady } from "./tfd-transport-policy";

export class TfdError extends Error {}

// Confirmed exclusions remain linked to their passenger for audit and dual custody.
export const activeTfdPassengerWhere: Prisma.HealthTfdPassengerWhereInput = {
  OR: [{ healthTfdPassengerRemoval: null }, { healthTfdPassengerRemoval: { is: { status: { not: "Confirmada" } } } }],
};

export function tfdTripAccessWhere(user: AppContext["user"]): Prisma.HealthTfdTripWhereInput {
  if (!user.hasHealthAccessScope) return {};
  const accessible = { patient: { referenceUnitId: { in: user.allowedHealthUnitIds || [] } } };
  return {
    AND: [
      { passengers: { every: accessible } },
      { OR: [{ passengers: { some: accessible } }, { createdByUsuarioId: user.id }] },
    ],
  };
}

async function lockTrips(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  }
}

function assertTripEditable(status: string) {
  if (!["PLANEJADA", "EMBARCANDO"].includes(status)) {
    throw new TfdError("Passageiros só podem ser alterados antes da saída da viagem.");
  }
}

async function assertNoFleetDeparture(tx: Prisma.TransactionClient, bookingId: string | null) {
  if (bookingId && await tx.fleetTrip.count({ where: { bookingId } })) throw new TfdError("A saída já foi registrada em Frotas; o manifesto de passageiros está encerrado.");
}

async function assertPassengerAccess(context: AppContext, tx: Prisma.TransactionClient, patientId: string, requestId?: string | null) {
  const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { referenceUnitId: true } });
  if (!patient) throw new TfdError("Paciente não encontrado.");
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  else if (context.user.hasHealthAccessScope) throw new TfdError("Paciente sem unidade de referência acessível.");
  if (requestId) {
    const request = await tx.healthTfdRequest.findUnique({ where: { id: requestId }, select: { patientId: true, originUnitId: true, status: true } });
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

export async function createTfdRequest(context: AppContext, raw: unknown) {
  const input = requestSchema.parse(raw);
  if (input.originUnitId) assertHealthUnitAccess(context.user, input.originUnitId);
  const patient = await context.prisma.patient.findUnique({ where: { id: input.patientId }, select: { id: true, referenceUnitId: true } });
  if (!patient) throw new TfdError("Paciente não encontrado.");
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  else if (context.user.hasHealthAccessScope) throw new TfdError("Paciente sem unidade de referência acessível.");
  if (context.user.hasHealthAccessScope && !input.originUnitId) throw new TfdError("Informe a unidade de origem da solicitação.");
  if (input.regulationRequestId) {
    const regulation = await context.prisma.healthRegulationRequest.findUnique({ where: { id: input.regulationRequestId }, select: { patientId: true, requestUnitId: true } });
    if (!regulation || regulation.patientId !== input.patientId) throw new TfdError("Regulação não pertence ao paciente.");
    if (regulation.requestUnitId) assertHealthUnitAccess(context.user, regulation.requestUnitId);
  }
  return context.prisma.healthTfdRequest.create({
    data: {
      patientId: input.patientId,
      regulationRequestId: input.regulationRequestId || null,
      originUnitId: input.originUnitId || null,
      destination: input.destination,
      reason: input.reason,
      priority: input.priority,
      companionName: input.companionName || null,
      companionDocument: input.companionDocument || null,
      createdByUsuarioId: context.user.id,
      events: { create: { eventType: "SOLICITACAO", toStatus: "SOLICITADA", reason: input.reason, actorUsuarioId: context.user.id } },
    },
    select: { id: true },
  });
}

export async function authorizeTfdRequest(context: AppContext, id: string) {
  return context.prisma.$transaction(async tx => {
    await lockTfdRequest(tx, id);
    const req = await tfdRequestForActor(tx, context, id);
    if (req.clinicalReport ? req.status !== "APROVADA" : req.status !== "SOLICITADA") throw new TfdError("O laudo deve estar aprovado antes da autorização; solicitações simples devem estar pendentes.");
    await tx.healthTfdRequest.update({ where: { id }, data: { status: "AUTORIZADA", authorizedAt: new Date() } });
    await tx.healthTfdRequestEvent.create({ data: { requestId: id, eventType: "AUTORIZACAO", fromStatus: req.status, toStatus: "AUTORIZADA", reportVersion: req.clinicalReport?.version, reason: "Tratamento autorizado pelo usuário responsável.", actorUsuarioId: context.user.id } });
    return { id };
  });
}

export async function createTfdTrip(context: AppContext, raw: unknown) {
  const input = tripSchema.parse(raw);
  const fleet = await context.prisma.fleetUnit.findUnique({ where: { id: input.fleetUnitId }, select: { id: true } });
  if (!fleet) throw new TfdError("Veículo não encontrado. Use um veículo do módulo Frotas.");
  if (input.driverEmployeeId) {
    const driver = await context.prisma.employee.findUnique({ where: { id: input.driverEmployeeId }, select: { id: true } });
    if (!driver) throw new TfdError("Condutor não encontrado.");
  }
  return context.prisma.healthTfdTrip.create({
    data: {
      date: new Date(`${input.date}T12:00:00`),
      origin: input.origin,
      destination: input.destination,
      fleetUnitId: input.fleetUnitId,
      driverEmployeeId: input.driverEmployeeId || null,
      capacity: input.capacity,
      createdByUsuarioId: context.user.id,
    },
    select: { id: true },
  });
}

export async function addPassenger(context: AppContext, input: { tripId: string; patientId: string; tfdRequestId?: string | null; companionName?: string | null; companionDocument?: string | null; kind?: string }) {
  if (input.kind && !["PACIENTE", "ACOMPANHANTE"].includes(input.kind)) throw new TfdError("Tipo de passageiro inválido.");
  const kind = input.kind === "ACOMPANHANTE" ? "ACOMPANHANTE" : "PACIENTE";
  if (kind === "ACOMPANHANTE" && !input.companionName?.trim()) throw new TfdError("Informe o nome do acompanhante.");
  return context.prisma.$transaction(async tx => {
    if (input.tfdRequestId) await lockTfdRequest(tx, input.tfdRequestId);
    await lockTrips(tx, [input.tripId]);
    const trip = await tx.healthTfdTrip.findFirst({ where: { id: input.tripId, ...tfdTripAccessWhere(context.user) }, select: { id: true, capacity: true, status: true, fleetBookingId: true } });
    if (!trip) throw new TfdError("Viagem não encontrada.");
    assertTripEditable(trip.status);
    await assertNoFleetDeparture(tx, trip.fleetBookingId);
    await assertPassengerAccess(context, tx, input.patientId, input.tfdRequestId);
    const existing = await tx.healthTfdPassenger.findUnique({ where: { tripId_patientId_kind: { tripId: input.tripId, patientId: input.patientId, kind } } });
    if (existing) throw new TfdError("Passageiro já registrado nesta viagem, inclusive no histórico de exclusões.");
    const count = await tx.healthTfdPassenger.count({ where: { tripId: input.tripId, ...activeTfdPassengerWhere } });
    if (count >= trip.capacity) throw new TfdError("Capacidade do veículo atingida.");
    // companionName distinguishes companion row, but patientId+kind unique prevents duplicate
    const passenger = await tx.healthTfdPassenger.create({
      data: {
        tripId: input.tripId,
        patientId: input.patientId,
        tfdRequestId: input.tfdRequestId || null,
        companionName: input.companionName || null,
        companionDocument: input.companionDocument || null,
        kind,
      },
      select: { id: true },
    });
    await tx.healthTfdTripEvent.create({ data: { tripId: trip.id, passengerId: passenger.id, eventType: "INTEGRANTE_INCLUIDO", reason: `${kind} incluído no transporte.`, metadata: { patientId: input.patientId, tfdRequestId: input.tfdRequestId || null }, actorUsuarioId: context.user.id } });
    return passenger;
  });
}

export async function movePassenger(context: AppContext, passengerId: string, targetTripId: string) {
  const passenger = await context.prisma.healthTfdPassenger.findUnique({ where: { id: passengerId }, select: { id: true, tripId: true, patientId: true, kind: true, companionName: true, companionDocument: true, tfdRequestId: true } });
  if (!passenger) throw new TfdError("Passageiro não encontrado.");
  return context.prisma.$transaction(async tx => {
    if (passenger.tfdRequestId) await lockTfdRequest(tx, passenger.tfdRequestId);
    await lockTrips(tx, [passenger.tripId, targetTripId]);
    const current = await tx.healthTfdPassenger.findFirst({ where: { id: passengerId, ...activeTfdPassengerWhere } });
    if (!current || current.tripId !== passenger.tripId) throw new TfdError("Passageiro alterado por outra operação. Atualize a página.");
    const source = await tx.healthTfdTrip.findFirst({ where: { id: current.tripId, ...tfdTripAccessWhere(context.user) } });
    const target = await tx.healthTfdTrip.findFirst({ where: { id: targetTripId, ...tfdTripAccessWhere(context.user) } });
    if (!source) throw new TfdError("Viagem de origem fora do escopo de acesso.");
    if (!target) throw new TfdError("Viagem destino não encontrada.");
    assertTripEditable(source.status);
    assertTripEditable(target.status);
    await assertNoFleetDeparture(tx, source.fleetBookingId);
    await assertNoFleetDeparture(tx, target.fleetBookingId);
    await assertPassengerAccess(context, tx, current.patientId, current.tfdRequestId);
    if (current.tripId === targetTripId) return { id: current.id };
    const count = await tx.healthTfdPassenger.count({ where: { tripId: targetTripId, ...activeTfdPassengerWhere } });
    if (count >= target.capacity) throw new TfdError("Capacidade da viagem destino atingida.");
    const result = await tx.healthTfdPassenger.update({ where: { id: passengerId }, data: { tripId: targetTripId, presenceStatus: "PENDING", presenceAt: null, presenceByUsuarioId: null }, select: { id: true } });
    for (const tripId of [source.id, target.id]) await tx.healthTfdTripEvent.create({ data: { tripId, passengerId, eventType: "TRANSFERENCIA", reason: `Transferência de ${source.id} para ${target.id}.`, metadata: { fromTripId: source.id, toTripId: target.id, previousPresenceStatus: current.presenceStatus }, actorUsuarioId: context.user.id } });
    return result;
  });
}

export async function requestPassengerRemoval(context: AppContext, passengerId: string) {
  const passenger = await context.prisma.healthTfdPassenger.findUnique({ where: { id: passengerId }, select: { tripId: true } });
  if (!passenger) throw new TfdError("Passageiro não encontrado.");
  return context.prisma.$transaction(async tx => {
    await lockTrips(tx, [passenger.tripId]);
    const current = await tx.healthTfdPassenger.findUnique({ where: { id: passengerId }, include: { trip: true } });
    if (!current || current.tripId !== passenger.tripId) throw new TfdError("Passageiro alterado por outra operação. Atualize a página.");
    if (!await tx.healthTfdTrip.findFirst({ where: { id: current.tripId, ...tfdTripAccessWhere(context.user) }, select: { id: true } })) throw new TfdError("Viagem fora do escopo de acesso.");
    assertTripEditable(current.trip.status);
    await assertNoFleetDeparture(tx, current.trip.fleetBookingId);
    await assertPassengerAccess(context, tx, current.patientId);
    const existing = await tx.healthTfdPassengerRemoval.findUnique({ where: { passengerId }, select: { status: true } });
    if (existing?.status === "Pendente") throw new TfdError("Já existe pedido de exclusão pendente.");
    if (existing?.status === "Confirmada") throw new TfdError("Passageiro já excluído da viagem.");
    const result = await tx.healthTfdPassengerRemoval.upsert({ where: { passengerId }, create: { passengerId, requestedByUsuarioId: context.user.id }, update: { requestedByUsuarioId: context.user.id, confirmedByUsuarioId: null, status: "Pendente" }, select: { id: true } });
    await tx.healthTfdTripEvent.create({ data: { tripId: current.tripId, passengerId, eventType: "EXCLUSAO_SOLICITADA", reason: "Exclusão solicitada para confirmação por segundo usuário.", actorUsuarioId: context.user.id } });
    return result;
  });
}

// Dupla custódia: a confirmação exige usuário diferente do solicitante.
export async function confirmPassengerRemoval(context: AppContext, passengerId: string, approve: boolean) {
  const passenger = await context.prisma.healthTfdPassenger.findUnique({ where: { id: passengerId }, select: { tripId: true } });
  if (!passenger) throw new TfdError("Passageiro não encontrado.");
  return context.prisma.$transaction(async tx => {
    await lockTrips(tx, [passenger.tripId]);
    const current = await tx.healthTfdPassenger.findUnique({ where: { id: passengerId }, include: { trip: true } });
    if (!current || current.tripId !== passenger.tripId) throw new TfdError("Passageiro alterado por outra operação. Atualize a página.");
    if (!await tx.healthTfdTrip.findFirst({ where: { id: current.tripId, ...tfdTripAccessWhere(context.user) }, select: { id: true } })) throw new TfdError("Viagem fora do escopo de acesso.");
    assertTripEditable(current.trip.status);
    await assertNoFleetDeparture(tx, current.trip.fleetBookingId);
    await assertPassengerAccess(context, tx, current.patientId);
    const removal = await tx.healthTfdPassengerRemoval.findUnique({ where: { passengerId } });
    if (!removal || removal.status !== "Pendente") throw new TfdError("Pedido de exclusão não está pendente.");
    if (removal.requestedByUsuarioId === context.user.id) throw new TfdError("A confirmação exige um segundo usuário (dupla custódia).");
    const result = await tx.healthTfdPassengerRemoval.update({ where: { id: removal.id }, data: { status: approve ? "Confirmada" : "Cancelada", confirmedByUsuarioId: context.user.id }, select: { id: true } });
    await tx.healthTfdTripEvent.create({ data: { tripId: current.tripId, passengerId, eventType: approve ? "EXCLUSAO_CONFIRMADA" : "EXCLUSAO_RECUSADA", reason: "Decisão do segundo usuário sobre a exclusão do integrante.", metadata: { requestedByUsuarioId: removal.requestedByUsuarioId }, actorUsuarioId: context.user.id } });
    return result;
  });
}

export async function updateTripStatus(context: AppContext, tripId: string, status: string) {
  const allowed: Record<string, string[]> = {
    PLANEJADA: ["EMBARCANDO","CANCELADA"],
    EMBARCANDO: ["EM_TRANSITO","CANCELADA"],
    EM_TRANSITO: ["RETORNANDO","CONCLUIDA"],
    RETORNANDO: ["CONCLUIDA"],
  };
  return context.prisma.$transaction(async tx => {
    await lockTrips(tx, [tripId]);
    const trip = await tx.healthTfdTrip.findFirst({ where: { id: tripId, ...tfdTripAccessWhere(context.user) }, select: { id: true, status: true, fleetBookingId: true, confirmedAt: true, passengers: { where: activeTfdPassengerWhere, select: { patientId: true, kind: true, presenceStatus: true, tfdRequest: { select: { status: true, clinicalReport: { select: { companionRequired: true } } } } } } } });
    if (!trip) throw new TfdError("Viagem não encontrada.");
    for (const passenger of trip.passengers) await assertPassengerAccess(context, tx, passenger.patientId);
    if (trip.status === status) return { id: trip.id, status: trip.status };
    if (!allowed[trip.status]?.includes(status)) throw new TfdError(`Transição de ${trip.status} para ${status} não permitida.`);
    const data: Record<string, unknown> = { status };
    if (status === "EM_TRANSITO") data["departureAt"] = new Date();
    if (status === "CONCLUIDA") data["returnAt"] = new Date();
    if (trip.fleetBookingId) {
      const booking = await tx.fleetBooking.findUniqueOrThrow({ where: { id: trip.fleetBookingId } });
      if (status === "EMBARCANDO" && (!trip.confirmedAt || booking.status !== "AGENDADO")) throw new TfdError("Confirme o transporte e mantenha a agenda de Frotas disponível antes do embarque.");
      if (status === "CANCELADA" && booking.status !== "CANCELADO") throw new TfdError("Cancele a agenda de origem em Frotas antes de cancelar o transporte.");
      if (["EM_TRANSITO", "RETORNANDO", "CONCLUIDA"].includes(status)) {
        const movement = await tx.fleetTrip.findUnique({ where: { bookingId: trip.fleetBookingId } });
        if (!movement) throw new TfdError("Registre a saída na guarita de Frotas antes de movimentar o transporte.");
        if (status === "EM_TRANSITO") {
          assertTfdBoardingReady(trip.passengers);
          data["departureAt"] = movement.departedAt;
        }
        if (status === "CONCLUIDA") {
          if (!movement.returnedAt) throw new TfdError("Registre o retorno em Frotas antes de concluir o transporte.");
          data["returnAt"] = movement.returnedAt;
        }
      }
    }
    const result = await tx.healthTfdTrip.update({ where: { id: tripId }, data, select: { id: true, status: true } });
    await tx.healthTfdTripEvent.create({ data: { tripId, eventType: "SITUACAO", reason: `${trip.status} → ${status}`, actorUsuarioId: context.user.id } });
    return result;
  });
}
