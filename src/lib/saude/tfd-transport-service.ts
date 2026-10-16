import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import type { FleetScope } from "@/lib/frotas/service";
import { eligibleFleetDriver, lockFleetResources, scopedFleetUnit } from "@/lib/frotas/control-access";
import { assertTravelAllowanceAccess } from "@/lib/rh/travel-allowance";
import { activeTfdPassengerWhere, tfdTripAccessWhere } from "./tfd-service";

const id = z.string().trim().min(1).max(200);
const note = z.string().trim().min(3).max(4000);

// A Health action can consume an existing booking in the user's own department.
// This bridge does not grant access to the general Fleet module or broaden its scope.
export function healthTransportFleetScope(context: AppContext): FleetScope {
  const administrator = isSystemAdministrator(context.user);
  if (!administrator && !context.user.departmentId) throw new Error("Vincule o operador de transporte a uma repartição.");
  return { actorId: context.user.id, employeeId: context.user.employeeId, departmentId: context.user.departmentId, administrator, canReadAssets: false, canIssueStock: false };
}

export async function createTfdTripFromBooking(context: AppContext, raw: unknown) {
  const input = z.object({ bookingId: id, capacity: z.number().int().min(1).max(100), assistantEmployeeId: id.nullable(), responsibleEmployeeId: id, advanceRequestId: id.nullable() }).strict().parse(raw);
  const scope = healthTransportFleetScope(context);
  return context.prisma.$transaction(async tx => {
    const initial = await tx.fleetBooking.findUniqueOrThrow({ where: { id: input.bookingId } });
    await lockFleetResources(tx, [`UNIT:${initial.unitId}`, ...(initial.driverId ? [`DRIVER:${initial.driverId}`] : [])]);
    const booking = await tx.fleetBooking.findUniqueOrThrow({ where: { id: input.bookingId } });
    if (booking.kind !== "VIAGEM" || booking.status !== "AGENDADO" || !booking.driverId) throw new Error("Selecione uma viagem agendada em Frotas com motorista identificado.");
    if (booking.unitId !== initial.unitId || booking.driverId !== initial.driverId) throw new Error("Agenda alterada por outra operação. Atualize a página.");
    const unit = await scopedFleetUnit(tx, scope, booking.unitId);
    if (unit.category !== "VEICULO") throw new Error("O transporte de pacientes exige veículo cadastrado em Frotas.");
    const driver = await eligibleFleetDriver(tx, scope, booking.driverId, unit, booking.startsAt);
    const route = booking.routeId ? await tx.fleetRoute.findFirst({ where: { id: booking.routeId, departmentId: unit.departmentId!, active: true } }) : null;
    if (!route) throw new Error("Vincule uma rota ativa à agenda de Frotas antes de criar o transporte.");
    for (const employeeId of [input.responsibleEmployeeId, input.assistantEmployeeId].filter((value): value is string => Boolean(value))) {
      if (!await tx.employee.count({ where: { id: employeeId, isActive: true, departmentId: unit.departmentId } })) throw new Error("Responsável e auxiliar devem estar ativos na repartição do transporte.");
    }
    let advanceAuthorizedAmount: Prisma.Decimal | null = null;
    if (input.advanceRequestId) {
      await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.advanceRequestId} FOR UPDATE`;
      const advance = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.advanceRequestId } });
      assertTravelAllowanceAccess(advance.payload, context);
      const memory = z.object({ scope: z.literal("PRODUCAO"), assessment: z.object({ amountBRL: z.string().regex(/^\d+(\.\d{1,2})?$/) }) }).parse(advance.payload);
      if (advance.kind !== "ADIANTAMENTO" || advance.status !== "DEFERIDA" || advance.employeeId !== input.responsibleEmployeeId) throw new Error("Adiantamento deve estar deferido no RH para o responsável pela viagem.");
      advanceAuthorizedAmount = new Prisma.Decimal(memory.assessment.amountBRL);
    }
    if (await tx.healthTfdTrip.count({ where: { fleetBookingId: booking.id } })) throw new Error("Esta agenda de Frotas já possui transporte TFD vinculado.");
    const trip = await tx.healthTfdTrip.create({ data: {
      fleetBookingId: booking.id, fleetUnitId: unit.id, driverEmployeeId: driver.employeeId,
      date: new Date(`${booking.startsAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T12:00:00Z`),
      origin: route.origin, destination: route.destination, purpose: booking.purpose, capacity: input.capacity,
      assistantEmployeeId: input.assistantEmployeeId, responsibleEmployeeId: input.responsibleEmployeeId,
      advanceRequestId: input.advanceRequestId, advanceAuthorizedAmount, createdByUsuarioId: context.user.id,
      events: { create: { eventType: "CRIACAO_FROTAS", reason: "Transporte criado a partir da agenda compartilhada de Frotas.", metadata: { bookingId: booking.id, routeId: route.id, driverId: driver.id }, actorUsuarioId: context.user.id } },
    } });
    return { id: trip.id };
  });
}

export async function confirmTfdTrip(context: AppContext, raw: unknown) {
  const input = z.object({ tripId: id, reason: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.tripId}))`;
    const trip = await tx.healthTfdTrip.findFirstOrThrow({ where: { id: input.tripId, ...tfdTripAccessWhere(context.user) } });
    if (trip.status !== "PLANEJADA" || trip.confirmedAt) throw new Error("A viagem deve estar planejada e ainda não confirmada.");
    if (!await tx.healthTfdPassenger.count({ where: { tripId: trip.id, kind: "PACIENTE", ...activeTfdPassengerWhere } })) throw new Error("Inclua ao menos um paciente antes de confirmar a viagem.");
    if (trip.fleetBookingId) {
      const booking = await tx.fleetBooking.findUniqueOrThrow({ where: { id: trip.fleetBookingId } });
      if (booking.status !== "AGENDADO") throw new Error("Agenda de Frotas não está disponível para confirmação.");
    }
    await tx.healthTfdTrip.update({ where: { id: trip.id }, data: { confirmedAt: new Date(), confirmedByUsuarioId: context.user.id } });
    await tx.healthTfdTripEvent.create({ data: { tripId: trip.id, eventType: "CONFIRMACAO", reason: input.reason, actorUsuarioId: context.user.id } });
    return { id: trip.id };
  });
}

export async function recordTfdPassengerBoarding(context: AppContext, raw: unknown) {
  const input = z.object({ passengerId: id, boardingLocation: z.string().trim().min(2).max(300), presenceStatus: z.enum(["PENDING", "BOARDED", "ABSENT"]), reason: note }).strict().parse(raw);
  const initial = await context.prisma.healthTfdPassenger.findUniqueOrThrow({ where: { id: input.passengerId }, select: { tripId: true } });
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.tripId}))`;
    const passenger = await tx.healthTfdPassenger.findFirstOrThrow({ where: { id: input.passengerId, tripId: initial.tripId, ...activeTfdPassengerWhere }, include: { trip: true } });
    if (!await tx.healthTfdTrip.count({ where: { id: initial.tripId, ...tfdTripAccessWhere(context.user) } })) throw new Error("Viagem fora do escopo de acesso.");
    if (!["PLANEJADA", "EMBARCANDO"].includes(passenger.trip.status)) throw new Error("Registre local e presença antes da saída do transporte.");
    if (passenger.trip.fleetBookingId && await tx.fleetTrip.count({ where: { bookingId: passenger.trip.fleetBookingId } })) throw new Error("A saída já foi registrada em Frotas; o manifesto de embarque está encerrado.");
    if (input.presenceStatus !== "PENDING" && passenger.trip.status !== "EMBARCANDO") throw new Error("A presença ou falta exige viagem em embarque.");
    const result = await tx.healthTfdPassenger.update({ where: { id: passenger.id }, data: { boardingLocation: input.boardingLocation, presenceStatus: input.presenceStatus, presenceAt: input.presenceStatus === "PENDING" ? null : new Date(), presenceByUsuarioId: context.user.id } });
    await tx.healthTfdTripEvent.create({ data: { tripId: initial.tripId, passengerId: passenger.id, eventType: "EMBARQUE", reason: input.reason, metadata: { from: passenger.presenceStatus, to: input.presenceStatus, boardingLocation: input.boardingLocation }, actorUsuarioId: context.user.id } });
    return { id: result.id };
  });
}
