import { Prisma } from "@prisma/client";
import type { FleetScope } from "./service";
import { controlSchemas } from "./control-policy";
import { eligibleFleetDriver, FleetControlError, fleetControlReading, lockFleetResources, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { assertTfdBoardingReady } from "@/lib/saude/tfd-transport-policy";

async function routeForUnit(tx: FleetControlTx, unit: { departmentId: string | null; control: { fixedRouteId: string | null } | null }, selected: string) {
  const id = selected || unit.control?.fixedRouteId;
  if (!id) return null;
  const route = await tx.fleetRoute.findFirst({ where: { id, active: true, departmentId: unit.departmentId! } });
  if (!route) throw new FleetControlError("Rota não está ativa na repartição da unidade.");
  return route;
}
export async function createFleetBooking(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.booking.parse(raw);
  await lockFleetResources(tx, [`UNIT:${input.unitId}`, ...(input.driverId ? [`DRIVER:${input.driverId}`] : [])]);
  const unit = await scopedFleetUnit(tx, scope, input.unitId);
  const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
  if (input.kind === "VIAGEM" && !input.driverId) throw new FleetControlError("Viagem exige motorista identificado.");
  if (input.driverId) await eligibleFleetDriver(tx, scope, input.driverId, unit, startsAt);
  const route = await routeForUnit(tx, unit, input.routeId);
  if (input.destinationId && !await tx.fleetDestination.findFirst({ where: { id: input.destinationId, active: true, departmentId: unit.departmentId! }, select: { id: true } })) throw new FleetControlError("Destino fora da repartição ou inativo.");
  if (input.previousId) {
    const previous = await tx.fleetBooking.findUnique({ where: { id: input.previousId } });
    if (!previous || previous.unitId !== unit.id || previous.status !== "AGENDADO") throw new FleetControlError("Agendamento anterior indisponível para reprogramação.");
    await tx.fleetBooking.update({ where: { id: previous.id }, data: { status: "REPROGRAMADO" } });
  }
  if (await tx.fleetBooking.count({ where: { status: { in: ["AGENDADO", "EM_USO"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, OR: [{ unitId: unit.id }, ...(input.driverId ? [{ driverId: input.driverId }] : [])] } })) throw new FleetControlError("Veículo ou motorista já agendado no intervalo.");
  if (await tx.fleetTrip.count({ where: { returnedAt: null, OR: [{ unitId: unit.id }, ...(input.driverId ? [{ driverId: input.driverId }] : [])] } })) throw new FleetControlError("Veículo ou motorista possui saída em aberto.");
  const result = await tx.fleetBooking.create({ data: { ...input, routeId: route?.id, driverId: input.driverId || null, destinationId: input.destinationId || null, startsAt, endsAt, previousId: input.previousId || null, createdById: scope.actorId } });
  return { id: result.id, type: "BOOKING", unitId: unit.id };
}
export async function cancelFleetBooking(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.cancelBooking.parse(raw), booking = await tx.fleetBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new FleetControlError("Agendamento não encontrado.");
  await lockFleetResources(tx, [`UNIT:${booking.unitId}`, ...(booking.driverId ? [`DRIVER:${booking.driverId}`] : [])]);
  await scopedFleetUnit(tx, scope, booking.unitId, false);
  const updated = await tx.fleetBooking.updateMany({ where: { id: booking.id, status: "AGENDADO" }, data: { status: "CANCELADO" } });
  if (!updated.count) throw new FleetControlError("Agendamento em uso, encerrado ou substituído.");
  return { id: booking.id, type: "BOOKING", unitId: booking.unitId };
}
export async function departFleetTrip(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.depart.parse(raw);
  await lockFleetResources(tx, [`DRIVER:${input.driverId}`, `UNIT:${input.unitId}`]);
  const now = new Date(), unit = await scopedFleetUnit(tx, scope, input.unitId);
  if (!["VEICULO", "MAQUINA"].includes(unit.category)) throw new FleetControlError("Somente veículo ou máquina pode registrar deslocamento independente.");
  const driver = await eligibleFleetDriver(tx, scope, input.driverId, unit, now);
  const reading = fleetControlReading(unit, input.reading);
  const route = await routeForUnit(tx, unit, input.routeId);
  const destination = input.destinationId ? await tx.fleetDestination.findFirst({ where: { id: input.destinationId, departmentId: unit.departmentId!, active: true } }) : null;
  if (input.destinationId && !destination) throw new FleetControlError("Destino não autorizado.");
  if (input.bookingId) {
    const booking = await tx.fleetBooking.findFirst({ where: { id: input.bookingId, unitId: unit.id, driverId: driver.id, status: "AGENDADO", startsAt: { lte: now }, endsAt: { gte: now } } });
    if (!booking) throw new FleetControlError("Agenda incompatível com veículo, motorista ou horário.");
    const linkedTransport = await tx.healthTfdTrip.findUnique({ where: { fleetBookingId: booking.id }, select: { id: true } });
    if (linkedTransport) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${linkedTransport.id}))`;
      const transport = await tx.healthTfdTrip.findUniqueOrThrow({ where: { id: linkedTransport.id }, include: { passengers: { where: { OR: [{ healthTfdPassengerRemoval: null }, { healthTfdPassengerRemoval: { is: { status: { not: "Confirmada" } } } }] }, select: { patientId: true, kind: true, presenceStatus: true, tfdRequest: { select: { status: true, clinicalReport: { select: { companionRequired: true } } } } } } } });
      if (transport.status !== "EMBARCANDO" || !transport.confirmedAt) throw new FleetControlError("Confirme a viagem TFD e abra o embarque antes da saída em Frotas.");
      assertTfdBoardingReady(transport.passengers);
    }
    await tx.fleetBooking.update({ where: { id: booking.id }, data: { status: "EM_USO" } });
  }
  if (await tx.fleetBooking.count({ where: { id: { not: input.bookingId || "__NONE__" }, status: { in: ["AGENDADO", "EM_USO"] }, startsAt: { lte: now }, endsAt: { gt: now }, OR: [{ unitId: unit.id }, { driverId: driver.id }] } })) throw new FleetControlError("Existe agenda de outro uso em curso.");
  if (await tx.fleetTrip.count({ where: { returnedAt: null, OR: [{ unitId: unit.id }, { driverId: driver.id }] } })) throw new FleetControlError("Veículo ou motorista já saiu e ainda não retornou.");
  const trip = await tx.fleetTrip.create({ data: { unitId: unit.id, driverId: driver.id, bookingId: input.bookingId || null, routeId: route?.id, destination: destination ? `${destination.name} — ${destination.city}` : input.destination, purpose: input.purpose, departedAt: now, meterType: unit.control?.meterType || "HODOMETRO", startReading: reading, checklist: input.checklist, driverSnapshot: { name: driver.person.fullName, employeeId: driver.employeeId, personId: driver.personId, departmentId: driver.currentDepartment }, routeSnapshot: route ? `${route.code} · ${route.name} | ${route.origin} → ${route.destination} | ${route.itinerary}` : null, createdById: scope.actorId } });
  await tx.fleetGateEvent.create({ data: { unitId: unit.id, tripId: trip.id, driverId: driver.id, kind: "SAIDA", reading, occurredAt: now, createdById: scope.actorId } });
  if (reading) await tx.fleetUnitControl.update({ where: { unitId: unit.id }, data: { currentReading: reading } });
  return { id: trip.id, type: "TRIP", unitId: unit.id };
}
export async function arriveFleetTrip(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.arrive.parse(raw), existing = await tx.fleetTrip.findUnique({ where: { id: input.tripId } });
  if (!existing) throw new FleetControlError("Saída não encontrada.");
  await lockFleetResources(tx, [`DRIVER:${existing.driverId}`, `UNIT:${existing.unitId}`]);
  const unit = await scopedFleetUnit(tx, scope, existing.unitId, false);
  const trip = await tx.fleetTrip.findUniqueOrThrow({ where: { id: input.tripId } });
  if (trip.returnedAt) throw new FleetControlError("Retorno já registrado.");
  if (trip.meterType !== (unit.control?.meterType || "HODOMETRO")) throw new FleetControlError("Tipo de marcador alterado desde a saída.");
  const reading = fleetControlReading(unit, input.reading);
  if (reading && trip.startReading && reading.lt(trip.startReading)) throw new FleetControlError("Marcador de chegada inferior ao da saída.");
  const now = new Date(), snapshot = trip.driverSnapshot as { name: string; employeeId: string | null };
  await tx.fleetTrip.update({ where: { id: trip.id }, data: { returnedAt: now, endReading: reading } });
  await tx.fleetGateEvent.create({ data: { unitId: unit.id, tripId: trip.id, driverId: trip.driverId, kind: "ENTRADA", reading, occurredAt: now, createdById: scope.actorId } });
  await tx.fleetUsage.create({ data: { unitId: unit.id, driverId: trip.driverId, tripId: trip.id, routeId: trip.routeId, routeSnapshot: trip.routeSnapshot, employeeId: snapshot.employeeId, employeeName: snapshot.name, startedAt: trip.departedAt, endedAt: now, purpose: `${trip.purpose} — ${trip.destination}`, meterType: trip.meterType, initialReading: trip.startReading, finalReading: reading, createdById: scope.actorId } });
  if (trip.bookingId) await tx.fleetBooking.update({ where: { id: trip.bookingId }, data: { status: "CONCLUIDO" } });
  if (reading) await tx.fleetUnitControl.update({ where: { unitId: unit.id }, data: { currentReading: reading } });
  return { id: trip.id, type: "TRIP", unitId: unit.id };
}

// Compatibility path for completed uses entered through the original Fleet editor.
export async function validateFleetHistoricalUsage(tx: FleetControlTx, scope: FleetScope, input: { unitId: string; employeeId: string | null; driverId?: string | null; startedAt: Date; endedAt: Date; initialReading: Prisma.Decimal | null; finalReading: Prisma.Decimal | null }) {
  const unit = await scopedFleetUnit(tx, scope, input.unitId);
  const driverId = input.driverId || (input.employeeId ? (await tx.fleetDriver.findUnique({ where: { employeeId: input.employeeId }, select: { id: true } }))?.id : null);
  if (input.endedAt > new Date()) throw new FleetControlError("Utilização realizada não pode terminar em data futura; utilize a agenda.");
  if (!driverId) throw new FleetControlError("Registre motorista e CNH antes de lançar utilização.");
  await lockFleetResources(tx, [`UNIT:${input.unitId}`, `DRIVER:${driverId}`]);
  const driver = await eligibleFleetDriver(tx, scope, driverId, unit, input.startedAt);
  if (input.employeeId && input.employeeId !== driver.employeeId) throw new FleetControlError("Motorista e servidor de origem não correspondem.");
  if (await tx.fleetUsage.count({ where: { startedAt: { lt: input.endedAt }, endedAt: { gt: input.startedAt }, OR: [{ unitId: unit.id }, { driverId: driver.id }] } })) throw new FleetControlError("Existe utilização registrada para veículo/motorista neste período.");
  const meterType = unit.control?.meterType || "HODOMETRO";
  if (meterType === "SEM_MARCADOR" && (input.initialReading !== null || input.finalReading !== null)) throw new FleetControlError("Unidade sem marcador não recebe leituras.");
  if (meterType !== "SEM_MARCADOR" && (input.initialReading === null || input.finalReading === null || input.finalReading.lt(input.initialReading))) throw new FleetControlError("Informe leituras inicial/final coerentes.");
  return { driverId: driver.id, employeeId: driver.employeeId, employeeName: driver.person.fullName, meterType };
}
