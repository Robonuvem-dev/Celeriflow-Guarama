import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import * as t from "@/db/schema/health-tfd";
import { fleetBookings, fleetRoutes, fleetTrips } from "@/db/schema/fleet";
import { employees } from "@/db/schema/administration";
import { hrPortalRequests } from "@/db/schema/personnel-workforce";
import { activeTfdPassengerWhere, lockTfdTrips, readTfdTrip, requiredTfdRecord } from "@/db/repositories/health-tfd/records";
import { assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { HealthTfdContext as AppContext } from "@/lib/contracts/health-tfd";
import type { FleetScope } from "@/lib/frotas/service";
import { eligibleFleetDriver, lockFleetResources, scopedFleetUnit } from "@/lib/frotas/control-access";

const id = z.string().trim().min(1).max(200);
const note = z.string().trim().min(3).max(4000);

// A Health action can consume an existing booking in the user's own department.
// This bridge does not grant access to the general Fleet module or broaden its scope.
export function healthTransportFleetScope(context: AppContext): FleetScope {
  const administrator = isSystemAdministrator(context.user);
  if (!administrator && !context.user.departmentId) throw new Error("Vincule o operador de transporte a uma repartição.");
  return { actorId: context.user.id, employeeId: context.user.employeeId, departmentId: context.user.departmentId, administrator, canReadAssets: false, canIssueStock: false };
}

export async function createTfdTripFromBooking(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ bookingId: id, capacity: z.number().int().min(1).max(100), assistantEmployeeId: id.nullable(), responsibleEmployeeId: id, advanceRequestId: id.nullable() }).strict().parse(raw);
  const scope = healthTransportFleetScope(context);
  return withDatabaseTransaction(connection, async tx => {
    const initial = requiredTfdRecord((await tx.select().from(fleetBookings).where(eq(fleetBookings.id, input.bookingId)).limit(1))[0]);
    await lockFleetResources(tx, [`UNIT:${initial.unitId}`, ...(initial.driverId ? [`DRIVER:${initial.driverId}`] : [])]);
    const booking = requiredTfdRecord((await tx.select().from(fleetBookings).where(eq(fleetBookings.id, input.bookingId)).limit(1))[0]);
    if (booking.kind !== "VIAGEM" || booking.status !== "AGENDADO" || !booking.driverId) throw new Error("Selecione uma viagem agendada em Frotas com motorista identificado.");
    if (booking.unitId !== initial.unitId || booking.driverId !== initial.driverId) throw new Error("Agenda alterada por outra operação. Atualize a página.");
    const unit = await scopedFleetUnit(tx, scope, booking.unitId);
    if (unit.category !== "VEICULO") throw new Error("O transporte de pacientes exige veículo cadastrado em Frotas.");
    const driver = await eligibleFleetDriver(tx, scope, booking.driverId, unit, booking.startsAt);
    const route = booking.routeId ? (await tx.select().from(fleetRoutes).where(and(eq(fleetRoutes.id, booking.routeId), unit.departmentId === null ? sql`false` : eq(fleetRoutes.departmentId, unit.departmentId), eq(fleetRoutes.active, true))).limit(1))[0] : null;
    if (!route) throw new Error("Vincule uma rota ativa à agenda de Frotas antes de criar o transporte.");
    for (const employeeId of [input.responsibleEmployeeId, input.assistantEmployeeId].filter((value): value is string => Boolean(value))) {
      if (!(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.isActive, true), unit.departmentId === null ? sql`${employees.departmentId} is null` : eq(employees.departmentId, unit.departmentId))).limit(1))[0]) throw new Error("Responsável e auxiliar devem estar ativos na repartição do transporte.");
    }
    let advanceAuthorizedAmount: Decimal | null = null;
    if (input.advanceRequestId) {
      await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.advanceRequestId} FOR UPDATE`);
      const advance = requiredTfdRecord((await tx.select().from(hrPortalRequests).where(eq(hrPortalRequests.id, input.advanceRequestId)).limit(1))[0]);
      // Same RH/UG rule as assertTravelAllowanceAccess; its legacy AppContext
      // contract still requires an unrelated client. TFD consumes identity only.
      const access = z.object({ scope: z.unknown().optional(), input: z.object({ budgetUnitId: z.string().optional() }).optional() }).parse(advance.payload);
      if (access.scope === "PRODUCAO") {
        if (!canPerformModuleOperation(context.user, "RH", "update") || !access.input?.budgetUnitId) throw new Error("Diária municipal exige autorização RH e UG definida.");
        assertBudgetUnitAccess(context.user, access.input.budgetUnitId);
      }
      const memory = z.object({ scope: z.literal("PRODUCAO"), assessment: z.object({ amountBRL: z.string().regex(/^\d+(\.\d{1,2})?$/) }) }).parse(advance.payload);
      if (advance.kind !== "ADIANTAMENTO" || advance.status !== "DEFERIDA" || advance.employeeId !== input.responsibleEmployeeId) throw new Error("Adiantamento deve estar deferido no RH para o responsável pela viagem.");
      advanceAuthorizedAmount = new Decimal(memory.assessment.amountBRL);
    }
    if ((await tx.select({ id: t.healthTfdTrips.id }).from(t.healthTfdTrips).where(eq(t.healthTfdTrips.fleetBookingId, booking.id)).limit(1))[0]) throw new Error("Esta agenda de Frotas já possui transporte TFD vinculado.");
    const trip = requiredTfdRecord((await tx.insert(t.healthTfdTrips).values({
      fleetBookingId: booking.id, fleetUnitId: unit.id, driverEmployeeId: driver.employeeId,
      date: new Date(`${booking.startsAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T12:00:00Z`),
      origin: route.origin, destination: route.destination, purpose: booking.purpose, capacity: input.capacity,
      assistantEmployeeId: input.assistantEmployeeId, responsibleEmployeeId: input.responsibleEmployeeId,
      advanceRequestId: input.advanceRequestId, advanceAuthorizedAmount, createdByUsuarioId: context.user.id,
    }).returning({ id: t.healthTfdTrips.id }))[0]);
    await tx.insert(t.healthTfdTripEvents).values({ tripId: trip.id, eventType: "CRIACAO_FROTAS", reason: "Transporte criado a partir da agenda compartilhada de Frotas.", metadata: { bookingId: booking.id, routeId: route.id, driverId: driver.id }, actorUsuarioId: context.user.id });
    return { id: trip.id };
  });
}

export async function confirmTfdTrip(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ tripId: id, reason: note }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdTrips(tx, [input.tripId]);
    const trip = requiredTfdRecord(await readTfdTrip(tx, context.user, input.tripId));
    if (trip.status !== "PLANEJADA" || trip.confirmedAt) throw new Error("A viagem deve estar planejada e ainda não confirmada.");
    if (!(await tx.select({ id: t.healthTfdPassengers.id }).from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.tripId, trip.id), eq(t.healthTfdPassengers.kind, "PACIENTE"), activeTfdPassengerWhere)).limit(1))[0]) throw new Error("Inclua ao menos um paciente antes de confirmar a viagem.");
    if (trip.fleetBookingId) {
      const booking = requiredTfdRecord((await tx.select().from(fleetBookings).where(eq(fleetBookings.id, trip.fleetBookingId)).limit(1))[0]);
      if (booking.status !== "AGENDADO") throw new Error("Agenda de Frotas não está disponível para confirmação.");
    }
    await tx.update(t.healthTfdTrips).set({ confirmedAt: new Date(), confirmedByUsuarioId: context.user.id }).where(eq(t.healthTfdTrips.id, trip.id));
    await tx.insert(t.healthTfdTripEvents).values({ tripId: trip.id, eventType: "CONFIRMACAO", reason: input.reason, actorUsuarioId: context.user.id });
    return { id: trip.id };
  });
}

export async function recordTfdPassengerBoarding(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ passengerId: id, boardingLocation: z.string().trim().min(2).max(300), presenceStatus: z.enum(["PENDING", "BOARDED", "ABSENT"]), reason: note }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const initial = requiredTfdRecord((await tx.select({ tripId: t.healthTfdPassengers.tripId }).from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.id, input.passengerId)).limit(1))[0]);
    await lockTfdTrips(tx, [initial.tripId]);
    const passenger = requiredTfdRecord((await tx.select().from(t.healthTfdPassengers).where(and(eq(t.healthTfdPassengers.id, input.passengerId), eq(t.healthTfdPassengers.tripId, initial.tripId), activeTfdPassengerWhere)).limit(1))[0]);
    const trip = await readTfdTrip(tx, context.user, initial.tripId);
    if (!trip) throw new Error("Viagem fora do escopo de acesso.");
    if (!["PLANEJADA", "EMBARCANDO"].includes(trip.status)) throw new Error("Registre local e presença antes da saída do transporte.");
    if (trip.fleetBookingId && (await tx.select({ id: fleetTrips.id }).from(fleetTrips).where(eq(fleetTrips.bookingId, trip.fleetBookingId)).limit(1))[0]) throw new Error("A saída já foi registrada em Frotas; o manifesto de embarque está encerrado.");
    if (input.presenceStatus !== "PENDING" && trip.status !== "EMBARCANDO") throw new Error("A presença ou falta exige viagem em embarque.");
    const result = requiredTfdRecord((await tx.update(t.healthTfdPassengers).set({ boardingLocation: input.boardingLocation, presenceStatus: input.presenceStatus, presenceAt: input.presenceStatus === "PENDING" ? null : new Date(), presenceByUsuarioId: context.user.id }).where(eq(t.healthTfdPassengers.id, passenger.id)).returning({ id: t.healthTfdPassengers.id }))[0]);
    await tx.insert(t.healthTfdTripEvents).values({ tripId: initial.tripId, passengerId: passenger.id, eventType: "EMBARQUE", reason: input.reason, metadata: { from: passenger.presenceStatus, to: input.presenceStatus, boardingLocation: input.boardingLocation }, actorUsuarioId: context.user.id });
    return { id: result.id };
  });
}
