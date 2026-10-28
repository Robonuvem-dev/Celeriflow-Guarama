import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { healthTransportFleetScope } from "@/lib/saude/tfd-transport-service";
import { activeTfdPassengerWhere, tfdTripAccessWhere } from "@/lib/saude/tfd-service";
import { createBookedTfdTripAction } from "./actions";
import { tfdRequestForActor } from "@/lib/saude/tfd-clinical-service";
import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db as defaultDatabase, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { fleetRoutes, fleetUnits, fleetBookings } from "@/db/schema/fleet";
import { employees as employeeTable } from "@/db/schema/administration";
import { healthTfdTrips, healthTfdPassengers } from "@/db/schema/health-tfd";

export default async function TfdTripsPage({ searchParams }: { searchParams: Promise<{ destination?: string; requestId?: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), scope = healthTransportFleetScope(context);
  const params = await searchParams, requestId = typeof params.requestId === "string" ? params.requestId.slice(0, 200) : "";
  const selectedRequest = requestId ? await withDatabaseTransaction(databaseConnection, tx => tfdRequestForActor(tx, context, requestId)) : null;
  if (selectedRequest && selectedRequest.status !== "AUTORIZADA") throw new Error("A seleção contextual de transporte exige tratamento autorizado.");
  const destination = typeof params.destination === "string" ? params.destination.slice(0, 200) : selectedRequest?.destination || "";
  const db = context.database ?? defaultDatabase;
  const [routes, units, employees, tripRows] = await Promise.all([
    db.select().from(fleetRoutes).where(and(eq(fleetRoutes.active, true), scope.administrator ? undefined : eq(fleetRoutes.departmentId, scope.departmentId!))).orderBy(asc(fleetRoutes.destination)),
    db.select({ id: fleetUnits.id, name: fleetUnits.name, plate: fleetUnits.plate }).from(fleetUnits).where(and(eq(fleetUnits.category, "VEICULO"), eq(fleetUnits.status, "ATIVO"), scope.administrator ? undefined : eq(fleetUnits.departmentId, scope.departmentId!))),
    db.select({ id: employeeTable.id, name: employeeTable.name }).from(employeeTable).where(and(eq(employeeTable.isActive, true), scope.administrator ? undefined : eq(employeeTable.departmentId, scope.departmentId!))).orderBy(asc(employeeTable.name)),
    db.select({ ...getTableColumns(healthTfdTrips), fleetUnit: { name: fleetUnits.name } }).from(healthTfdTrips).innerJoin(fleetUnits, eq(fleetUnits.id, healthTfdTrips.fleetUnitId)).where(tfdTripAccessWhere(context.user)).orderBy(desc(healthTfdTrips.date)).limit(100),
  ]);
  const manifest = await db.select({ id: healthTfdPassengers.id, tripId: healthTfdPassengers.tripId }).from(healthTfdPassengers).where(and(inArray(healthTfdPassengers.tripId, tripRows.map(row => row.id)), activeTfdPassengerWhere));
  const trips = tripRows.map(row => ({ ...row, passengers: manifest.filter(item => item.tripId === row.id).map(({ id }) => ({ id })) }));
  const selectedRoutes = routes.filter(route => !destination || route.destination === destination);
  const bookings = await db.select().from(fleetBookings).where(and(inArray(fleetBookings.unitId, units.map(unit => unit.id)), inArray(fleetBookings.routeId, selectedRoutes.map(route => route.id)), eq(fleetBookings.kind, "VIAGEM"), eq(fleetBookings.status, "AGENDADO"), sql`NOT EXISTS (SELECT 1 FROM ${healthTfdTrips} WHERE ${healthTfdTrips.fleetBookingId}=${fleetBookings.id})`)).orderBy(asc(fleetBookings.startsAt)).limit(200);
  return <main className="space-y-4 p-4"><header><Link href="/saude/tfd" className="text-sm underline">TFD e transporte</Link><h1 className="text-xl font-semibold">Transportes vinculados à agenda de Frotas</h1></header>
    <form className="flex gap-2"><select name="destination" defaultValue={destination} className="rounded border p-2"><option value="">Todos os destinos</option>{[...new Set(routes.map(route => route.destination))].map(value => <option key={value}>{value}</option>)}</select><button className="rounded border p-2">Consultar rotas por destino</button></form>
    <form action={createBookedTfdTripAction} className="grid gap-3 rounded border bg-white p-3 text-sm md:grid-cols-2"><h2 className="font-semibold md:col-span-2">Criar transporte a partir de uma viagem agendada</h2><label className="md:col-span-2">Agenda / rota<select name="bookingId" required className="w-full rounded border p-2"><option value="">Selecione</option>{bookings.map(booking => { const unit = units.find(unit => unit.id === booking.unitId), route = routes.find(route => route.id === booking.routeId); return <option key={booking.id} value={booking.id}>{booking.startsAt.toLocaleString("pt-BR")} · {route?.name} · {route?.destination} · {unit?.name} {unit?.plate} · {booking.purpose}</option>; })}</select></label><label>Capacidade para pacientes e acompanhantes<input name="capacity" type="number" min={1} max={100} required className="w-full rounded border p-2"/></label><label>Responsável<select name="responsibleEmployeeId" required className="w-full rounded border p-2"><option value="">Selecione</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Auxiliar<select name="assistantEmployeeId" className="w-full rounded border p-2"><option value="">Sem auxiliar</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Solicitação de adiantamento deferida no RH (opcional)<input name="advanceRequestId" className="w-full rounded border p-2"/></label><p className="text-xs md:col-span-2">Veículo, motorista, motivo, horário e rota são reaproveitados de Frotas. O vínculo de adiantamento exige a permissão RH correspondente e conserva a origem financeira.</p><button className="rounded bg-amber-700 p-2 text-white md:col-span-2">Criar transporte</button></form>
    <section className="space-y-2"><h2 className="font-semibold">Últimas viagens acessíveis</h2>{trips.map(trip => <Link key={trip.id} href={`/saude/tfd/viagens/${encodeURIComponent(trip.id)}`} className="block rounded border bg-white p-3 text-sm">{trip.date.toLocaleDateString("pt-BR")} · {trip.origin} → {trip.destination} · {trip.fleetUnit.name} · {trip.passengers.length}/{trip.capacity} · {trip.status}{trip.fleetBookingId ? " · agenda Frotas vinculada" : " · viagem anterior sem vínculo de agenda"}</Link>)}</section>
  </main>;
}
