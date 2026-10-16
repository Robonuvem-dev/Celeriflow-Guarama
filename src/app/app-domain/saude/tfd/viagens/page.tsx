import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { healthTransportFleetScope } from "@/lib/saude/tfd-transport-service";
import { activeTfdPassengerWhere, tfdTripAccessWhere } from "@/lib/saude/tfd-service";
import { createBookedTfdTripAction } from "./actions";
import { tfdRequestForActor } from "@/lib/saude/tfd-clinical-service";

export default async function TfdTripsPage({ searchParams }: { searchParams: Promise<{ destination?: string; requestId?: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), scope = healthTransportFleetScope(context);
  const params = await searchParams, requestId = typeof params.requestId === "string" ? params.requestId.slice(0, 200) : "";
  const selectedRequest = requestId ? await context.prisma.$transaction(tx => tfdRequestForActor(tx, context, requestId)) : null;
  if (selectedRequest && selectedRequest.status !== "AUTORIZADA") throw new Error("A seleção contextual de transporte exige tratamento autorizado.");
  const destination = typeof params.destination === "string" ? params.destination.slice(0, 200) : selectedRequest?.destination || "";
  const department = scope.administrator ? {} : { departmentId: scope.departmentId! };
  const [routes, units, employees, trips] = await Promise.all([
    context.prisma.fleetRoute.findMany({ where: { active: true, ...department }, orderBy: { destination: "asc" } }),
    context.prisma.fleetUnit.findMany({ where: { category: "VEICULO", status: "ATIVO", ...department }, select: { id: true, name: true, plate: true } }),
    context.prisma.employee.findMany({ where: { isActive: true, ...department }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthTfdTrip.findMany({ where: tfdTripAccessWhere(context.user), orderBy: { date: "desc" }, take: 100, include: { fleetUnit: { select: { name: true } }, passengers: { where: activeTfdPassengerWhere, select: { id: true } } } }),
  ]);
  const selectedRoutes = routes.filter(route => !destination || route.destination === destination);
  const bookings = await context.prisma.fleetBooking.findMany({ where: { unitId: { in: units.map(unit => unit.id) }, routeId: { in: selectedRoutes.map(route => route.id) }, kind: "VIAGEM", status: "AGENDADO", healthTfdTrip: null }, orderBy: { startsAt: "asc" }, take: 200 });
  return <main className="space-y-4 p-4"><header><Link href="/saude/tfd" className="text-sm underline">TFD e transporte</Link><h1 className="text-xl font-semibold">Transportes vinculados à agenda de Frotas</h1></header>
    <form className="flex gap-2"><select name="destination" defaultValue={destination} className="rounded border p-2"><option value="">Todos os destinos</option>{[...new Set(routes.map(route => route.destination))].map(value => <option key={value}>{value}</option>)}</select><button className="rounded border p-2">Consultar rotas por destino</button></form>
    <form action={createBookedTfdTripAction} className="grid gap-3 rounded border bg-white p-3 text-sm md:grid-cols-2"><h2 className="font-semibold md:col-span-2">Criar transporte a partir de uma viagem agendada</h2><label className="md:col-span-2">Agenda / rota<select name="bookingId" required className="w-full rounded border p-2"><option value="">Selecione</option>{bookings.map(booking => { const unit = units.find(unit => unit.id === booking.unitId), route = routes.find(route => route.id === booking.routeId); return <option key={booking.id} value={booking.id}>{booking.startsAt.toLocaleString("pt-BR")} · {route?.name} · {route?.destination} · {unit?.name} {unit?.plate} · {booking.purpose}</option>; })}</select></label><label>Capacidade para pacientes e acompanhantes<input name="capacity" type="number" min={1} max={100} required className="w-full rounded border p-2"/></label><label>Responsável<select name="responsibleEmployeeId" required className="w-full rounded border p-2"><option value="">Selecione</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Auxiliar<select name="assistantEmployeeId" className="w-full rounded border p-2"><option value="">Sem auxiliar</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Solicitação de adiantamento deferida no RH (opcional)<input name="advanceRequestId" className="w-full rounded border p-2"/></label><p className="text-xs md:col-span-2">Veículo, motorista, motivo, horário e rota são reaproveitados de Frotas. O vínculo de adiantamento exige a permissão RH correspondente e conserva a origem financeira.</p><button className="rounded bg-amber-700 p-2 text-white md:col-span-2">Criar transporte</button></form>
    <section className="space-y-2"><h2 className="font-semibold">Últimas viagens acessíveis</h2>{trips.map(trip => <Link key={trip.id} href={`/saude/tfd/viagens/${encodeURIComponent(trip.id)}`} className="block rounded border bg-white p-3 text-sm">{trip.date.toLocaleDateString("pt-BR")} · {trip.origin} → {trip.destination} · {trip.fleetUnit.name} · {trip.passengers.length}/{trip.capacity} · {trip.status}{trip.fleetBookingId ? " · agenda Frotas vinculada" : " · viagem anterior sem vínculo de agenda"}</Link>)}</section>
  </main>;
}
