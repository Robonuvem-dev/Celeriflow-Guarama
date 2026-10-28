import { and, eq, gt, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import type { Decimal } from "@/db/decimal";
import * as f from "@/db/schema/fleet";
import { requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetTfdBoarding } from "@/db/repositories/fleet/sources";
import type { FleetScope } from "./service";
import { controlSchemas } from "./control-policy";
import { eligibleFleetDriver, FleetControlError, fleetControlReading, lockFleetResources, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { assertTfdBoardingReady } from "@/lib/saude/tfd-transport-policy";

async function routeForUnit(tx: FleetControlTx, unit: { departmentId: string | null; control: { fixedRouteId: string | null } | null }, selected: string) {
  const id = selected || unit.control?.fixedRouteId;
  if (!id) return null;
  const [route] = await tx.select().from(f.fleetRoutes).where(and(eq(f.fleetRoutes.id, id), eq(f.fleetRoutes.active, true), eq(f.fleetRoutes.departmentId, unit.departmentId!))).limit(1);
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
  if (input.destinationId && !(await tx.select({ id: f.fleetDestinations.id }).from(f.fleetDestinations).where(and(eq(f.fleetDestinations.id, input.destinationId), eq(f.fleetDestinations.active, true), eq(f.fleetDestinations.departmentId, unit.departmentId!))).limit(1)).length) throw new FleetControlError("Destino fora da repartição ou inativo.");
  if (input.previousId) {
    const [previous] = await tx.select().from(f.fleetBookings).where(eq(f.fleetBookings.id, input.previousId)).limit(1);
    if (!previous || previous.unitId !== unit.id || previous.status !== "AGENDADO") throw new FleetControlError("Agendamento anterior indisponível para reprogramação.");
    await tx.update(f.fleetBookings).set({ status: "REPROGRAMADO" }).where(eq(f.fleetBookings.id, previous.id));
  }
  if ((await tx.select({ id: f.fleetBookings.id }).from(f.fleetBookings).where(and(inArray(f.fleetBookings.status, ["AGENDADO", "EM_USO"]), lt(f.fleetBookings.startsAt, endsAt), gt(f.fleetBookings.endsAt, startsAt), or(eq(f.fleetBookings.unitId, unit.id), input.driverId ? eq(f.fleetBookings.driverId, input.driverId) : undefined))).limit(1)).length) throw new FleetControlError("Veículo ou motorista já agendado no intervalo.");
  if ((await tx.select({ id: f.fleetTrips.id }).from(f.fleetTrips).where(and(isNull(f.fleetTrips.returnedAt), or(eq(f.fleetTrips.unitId, unit.id), input.driverId ? eq(f.fleetTrips.driverId, input.driverId) : undefined))).limit(1)).length) throw new FleetControlError("Veículo ou motorista possui saída em aberto.");
  const result = requiredFleetRecord(await tx.insert(f.fleetBookings).values({ ...input, routeId: route?.id, driverId: input.driverId || null, destinationId: input.destinationId || null, startsAt, endsAt, previousId: input.previousId || null, createdById: scope.actorId }).returning());
  return { id: result.id, type: "BOOKING", unitId: unit.id };
}
export async function cancelFleetBooking(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.cancelBooking.parse(raw), [booking] = await tx.select().from(f.fleetBookings).where(eq(f.fleetBookings.id, input.bookingId)).limit(1);
  if (!booking) throw new FleetControlError("Agendamento não encontrado.");
  await lockFleetResources(tx, [`UNIT:${booking.unitId}`, ...(booking.driverId ? [`DRIVER:${booking.driverId}`] : [])]);
  await scopedFleetUnit(tx, scope, booking.unitId, false);
  const updated = await tx.update(f.fleetBookings).set({ status: "CANCELADO" }).where(and(eq(f.fleetBookings.id, booking.id), eq(f.fleetBookings.status, "AGENDADO"))).returning({ id: f.fleetBookings.id });
  if (!updated.length) throw new FleetControlError("Agendamento em uso, encerrado ou substituído.");
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
  const destination = input.destinationId ? (await tx.select().from(f.fleetDestinations).where(and(eq(f.fleetDestinations.id, input.destinationId), eq(f.fleetDestinations.departmentId, unit.departmentId!), eq(f.fleetDestinations.active, true))).limit(1))[0] : null;
  if (input.destinationId && !destination) throw new FleetControlError("Destino não autorizado.");
  if (input.bookingId) {
    const [booking] = await tx.select().from(f.fleetBookings).where(and(eq(f.fleetBookings.id, input.bookingId), eq(f.fleetBookings.unitId, unit.id), eq(f.fleetBookings.driverId, driver.id), eq(f.fleetBookings.status, "AGENDADO"), lte(f.fleetBookings.startsAt, now), gte(f.fleetBookings.endsAt, now))).limit(1);
    if (!booking) throw new FleetControlError("Agenda incompatível com veículo, motorista ou horário.");
    const transport = await readFleetTfdBoarding(tx, booking.id);
    if (transport) {
      if (transport.status !== "EMBARCANDO" || !transport.confirmedAt) throw new FleetControlError("Confirme a viagem TFD e abra o embarque antes da saída em Frotas.");
      assertTfdBoardingReady(transport.passengers);
    }
    await tx.update(f.fleetBookings).set({ status: "EM_USO" }).where(eq(f.fleetBookings.id, booking.id));
  }
  if ((await tx.select({ id: f.fleetBookings.id }).from(f.fleetBookings).where(and(ne(f.fleetBookings.id, input.bookingId || "__NONE__"), inArray(f.fleetBookings.status, ["AGENDADO", "EM_USO"]), lte(f.fleetBookings.startsAt, now), gt(f.fleetBookings.endsAt, now), or(eq(f.fleetBookings.unitId, unit.id), eq(f.fleetBookings.driverId, driver.id)))).limit(1)).length) throw new FleetControlError("Existe agenda de outro uso em curso.");
  if ((await tx.select({ id: f.fleetTrips.id }).from(f.fleetTrips).where(and(isNull(f.fleetTrips.returnedAt), or(eq(f.fleetTrips.unitId, unit.id), eq(f.fleetTrips.driverId, driver.id)))).limit(1)).length) throw new FleetControlError("Veículo ou motorista já saiu e ainda não retornou.");
  const trip = requiredFleetRecord(await tx.insert(f.fleetTrips).values({ unitId: unit.id, driverId: driver.id, bookingId: input.bookingId || null, routeId: route?.id, destination: destination ? `${destination.name} — ${destination.city}` : input.destination, purpose: input.purpose, departedAt: now, meterType: unit.control?.meterType || "HODOMETRO", startReading: reading, checklist: input.checklist, driverSnapshot: { name: driver.person.fullName, employeeId: driver.employeeId, personId: driver.personId, departmentId: driver.currentDepartment }, routeSnapshot: route ? `${route.code} · ${route.name} | ${route.origin} → ${route.destination} | ${route.itinerary}` : null, createdById: scope.actorId }).returning());
  await tx.insert(f.fleetGateEvents).values({ unitId: unit.id, tripId: trip.id, driverId: driver.id, kind: "SAIDA", reading, occurredAt: now, createdById: scope.actorId });
  if (reading) requiredFleetRecord(await tx.update(f.fleetUnitControls).set({ currentReading: reading }).where(eq(f.fleetUnitControls.unitId, unit.id)).returning());
  return { id: trip.id, type: "TRIP", unitId: unit.id };
}
export async function arriveFleetTrip(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.arrive.parse(raw), [existing] = await tx.select().from(f.fleetTrips).where(eq(f.fleetTrips.id, input.tripId)).limit(1);
  if (!existing) throw new FleetControlError("Saída não encontrada.");
  await lockFleetResources(tx, [`DRIVER:${existing.driverId}`, `UNIT:${existing.unitId}`]);
  const unit = await scopedFleetUnit(tx, scope, existing.unitId, false);
  const trip = requiredFleetRecord(await tx.select().from(f.fleetTrips).where(eq(f.fleetTrips.id, input.tripId)).limit(1));
  if (trip.returnedAt) throw new FleetControlError("Retorno já registrado.");
  if (trip.meterType !== (unit.control?.meterType || "HODOMETRO")) throw new FleetControlError("Tipo de marcador alterado desde a saída.");
  const reading = fleetControlReading(unit, input.reading);
  if (reading && trip.startReading && reading.lt(trip.startReading)) throw new FleetControlError("Marcador de chegada inferior ao da saída.");
  const now = new Date(), snapshot = trip.driverSnapshot as { name: string; employeeId: string | null };
  await tx.update(f.fleetTrips).set({ returnedAt: now, endReading: reading }).where(eq(f.fleetTrips.id, trip.id));
  await tx.insert(f.fleetGateEvents).values({ unitId: unit.id, tripId: trip.id, driverId: trip.driverId, kind: "ENTRADA", reading, occurredAt: now, createdById: scope.actorId });
  await tx.insert(f.fleetUsages).values({ unitId: unit.id, driverId: trip.driverId, tripId: trip.id, routeId: trip.routeId, routeSnapshot: trip.routeSnapshot, employeeId: snapshot.employeeId, employeeName: snapshot.name, startedAt: trip.departedAt, endedAt: now, purpose: `${trip.purpose} — ${trip.destination}`, meterType: trip.meterType, initialReading: trip.startReading, finalReading: reading, createdById: scope.actorId });
  if (trip.bookingId) await tx.update(f.fleetBookings).set({ status: "CONCLUIDO" }).where(eq(f.fleetBookings.id, trip.bookingId));
  if (reading) requiredFleetRecord(await tx.update(f.fleetUnitControls).set({ currentReading: reading }).where(eq(f.fleetUnitControls.unitId, unit.id)).returning());
  return { id: trip.id, type: "TRIP", unitId: unit.id };
}

// Compatibility path for completed uses entered through the original Fleet editor.
export async function validateFleetHistoricalUsage(tx: FleetControlTx, scope: FleetScope, input: { unitId: string; employeeId: string | null; driverId?: string | null; startedAt: Date; endedAt: Date; initialReading: Decimal | null; finalReading: Decimal | null }) {
  const unit = await scopedFleetUnit(tx, scope, input.unitId);
  const driverId = input.driverId || (input.employeeId ? (await tx.select({ id: f.fleetDrivers.id }).from(f.fleetDrivers).where(eq(f.fleetDrivers.employeeId, input.employeeId)).limit(1))[0]?.id : null);
  if (input.endedAt > new Date()) throw new FleetControlError("Utilização realizada não pode terminar em data futura; utilize a agenda.");
  if (!driverId) throw new FleetControlError("Registre motorista e CNH antes de lançar utilização.");
  await lockFleetResources(tx, [`UNIT:${input.unitId}`, `DRIVER:${driverId}`]);
  const driver = await eligibleFleetDriver(tx, scope, driverId, unit, input.startedAt);
  if (input.employeeId && input.employeeId !== driver.employeeId) throw new FleetControlError("Motorista e servidor de origem não correspondem.");
  if ((await tx.select({ id: f.fleetUsages.id }).from(f.fleetUsages).where(and(lt(f.fleetUsages.startedAt, input.endedAt), gt(f.fleetUsages.endedAt, input.startedAt), or(eq(f.fleetUsages.unitId, unit.id), eq(f.fleetUsages.driverId, driver.id)))).limit(1)).length) throw new FleetControlError("Existe utilização registrada para veículo/motorista neste período.");
  const meterType = unit.control?.meterType || "HODOMETRO";
  if (meterType === "SEM_MARCADOR" && (input.initialReading !== null || input.finalReading !== null)) throw new FleetControlError("Unidade sem marcador não recebe leituras.");
  if (meterType !== "SEM_MARCADOR" && (input.initialReading === null || input.finalReading === null || input.finalReading.lt(input.initialReading))) throw new FleetControlError("Informe leituras inicial/final coerentes.");
  return { driverId: driver.id, employeeId: driver.employeeId, employeeName: driver.person.fullName, meterType };
}
