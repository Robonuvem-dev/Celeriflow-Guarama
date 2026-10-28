import { Bus } from "lucide-react";
import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { HealthSimpleListClient } from "../HealthSimpleListClient";
import { addPassengerAction, authorizeTfdAction, confirmPassengerRemovalAction, createTfdRequestAction, createTripAction, movePassengerAction, requestPassengerRemovalAction, updateTripStatusAction } from "./actions";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { healthTfdTrips, healthTfdRequests, healthTfdPassengers, healthTfdPassengerRemovals } from "@/db/schema/health-tfd";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits } from "@/db/schema/health-workforce";
import { fleetUnits as fleetUnitTable } from "@/db/schema/fleet";
import { employees as employeeTable } from "@/db/schema/administration";
import { healthRegulationRequests } from "@/db/schema/health-regulation";
import { pharmacyPatients } from "@/db/repositories/health-pharmacy-pages/common";
import { activeTfdPassengerWhere, tfdTripAccessWhere } from "@/lib/saude/tfd-service";

const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const PAGE_SIZE = 20;
type Params = { q?: string | string[]; filter?: string | string[]; page?: string | string[] };
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
const num = (v: string | undefined) => v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : 1;

export default async function TfdPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const db = context.database;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const params = await searchParams;
  const q = (first(params.q) || "").trim().slice(0, 120);
  const filter = (first(params.filter) || "").trim().slice(0, 40);
  const access = tfdTripAccessWhere(context.user);
  const where = and(access, filter ? eq(healthTfdTrips.status, filter) : undefined, q ? or(ilike(healthTfdTrips.origin, `%${q}%`), ilike(healthTfdTrips.destination, `%${q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(healthTfdTrips).where(where);
  const page = Math.min(num(first(params.page)), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [tripRows, requestRows, patients, units, fleetUnits, employees, passengerRows, removalRows, regulationRows] = await Promise.all([
    db.select({ trip: healthTfdTrips, fleetUnit: fleetUnitTable, driverEmployee: employeeTable }).from(healthTfdTrips).innerJoin(fleetUnitTable, eq(fleetUnitTable.id, healthTfdTrips.fleetUnitId)).leftJoin(employeeTable, eq(employeeTable.id, healthTfdTrips.driverEmployeeId)).where(where).orderBy(desc(healthTfdTrips.date)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    db.select({ request: healthTfdRequests, patient: patientTable, person: people, originUnit: healthUnits }).from(healthTfdRequests).innerJoin(patientTable, eq(patientTable.id, healthTfdRequests.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).leftJoin(healthUnits, eq(healthUnits.id, healthTfdRequests.originUnitId)).where(unitIds ? inArray(healthTfdRequests.originUnitId, unitIds) : undefined).orderBy(desc(healthTfdRequests.createdAt)).limit(500),
    pharmacyPatients(db, unitIds, undefined, 500),
    db.select().from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    db.select().from(fleetUnitTable).where(and(eq(fleetUnitTable.category, "VEICULO"), eq(fleetUnitTable.status, "ATIVO"))).orderBy(asc(fleetUnitTable.name)).limit(200),
    db.select().from(employeeTable).where(eq(employeeTable.isActive, true)).orderBy(asc(employeeTable.name)).limit(200),
    db.select({ passenger: healthTfdPassengers, trip: healthTfdTrips, patient: patientTable, person: people }).from(healthTfdPassengers).innerJoin(healthTfdTrips, eq(healthTfdTrips.id, healthTfdPassengers.tripId)).innerJoin(patientTable, eq(patientTable.id, healthTfdPassengers.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).where(and(activeTfdPassengerWhere, access)).orderBy(desc(healthTfdPassengers.createdAt)).limit(200),
    db.select({ removal: healthTfdPassengerRemovals, passenger: healthTfdPassengers, patient: patientTable, person: people }).from(healthTfdPassengerRemovals).innerJoin(healthTfdPassengers, eq(healthTfdPassengers.id, healthTfdPassengerRemovals.passengerId)).innerJoin(healthTfdTrips, eq(healthTfdTrips.id, healthTfdPassengers.tripId)).innerJoin(patientTable, eq(patientTable.id, healthTfdPassengers.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).where(and(eq(healthTfdPassengerRemovals.status, "Pendente"), access)).limit(100),
    db.select({ id: healthRegulationRequests.id, description: healthRegulationRequests.description, fullName: people.fullName }).from(healthRegulationRequests).innerJoin(patientTable, eq(patientTable.id, healthRegulationRequests.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).where(unitIds ? inArray(healthRegulationRequests.requestUnitId, unitIds) : undefined).orderBy(desc(healthRegulationRequests.createdAt)).limit(100),
  ]);
  const manifestRows = await db.select({ passenger: healthTfdPassengers, patient: patientTable, person: people }).from(healthTfdPassengers).innerJoin(patientTable, eq(patientTable.id, healthTfdPassengers.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).where(and(inArray(healthTfdPassengers.tripId, tripRows.map(row => row.trip.id)), activeTfdPassengerWhere));
  const trips = tripRows.map(row => ({ ...row.trip, fleetUnit: row.fleetUnit, driverEmployee: row.driverEmployee, passengers: manifestRows.filter(item => item.passenger.tripId === row.trip.id).map(item => ({ ...item.passenger, patient: { ...item.patient, person: item.person } })) }));
  const requests = requestRows.map(row => ({ ...row.request, patient: { ...row.patient, person: row.person }, originUnit: row.originUnit }));
  const passengers = passengerRows.map(row => ({ ...row.passenger, trip: row.trip, patient: { ...row.patient, person: row.person } }));
  const removals = removalRows.map(row => ({ ...row.removal, passenger: { ...row.passenger, patient: { ...row.patient, person: row.person } } }));
  const regulationRequests = regulationRows.map(row => ({ id: row.id, description: row.description, patient: { person: { fullName: row.fullName } } }));

  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="TFD e Transporte" icon={<Bus className="size-4 text-amber-700" />} />
      <Link href="/saude/tfd/laudos" className="shrink-0 text-sm font-semibold text-amber-800 underline">Laudos clínicos, trâmites e benefícios TFD</Link>
      <Link href="/saude/tfd/viagens" className="shrink-0 text-sm font-semibold text-amber-800 underline">Agenda por destino, confirmação, embarque e ordem de tráfego</Link>
      <div className="grid shrink-0 gap-2 lg:grid-cols-3">
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Solicitar TFD</summary><form action={createTfdRequestAction} className="mt-2 grid gap-1"><select name="patientId" required className={field}><option value="">Paciente</option>{patients.map(p => <option key={p.id} value={p.id}>{p.person.fullName}</option>)}</select><select name="originUnitId" required={Boolean(unitIds)} className={field}><option value="">Unidade origem</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select><select name="regulationRequestId" className={field}><option value="">Sem regulação vinculada</option>{regulationRequests.map(r => <option key={r.id} value={r.id}>{r.patient.person.fullName} · {r.description || r.id}</option>)}</select><input name="destination" required placeholder="Destino" className={field}/><textarea name="reason" required placeholder="Motivo" className="min-h-12 rounded border p-2"/><select name="priority" className={field}><option>Normal</option><option>Media</option><option>Alta</option></select><input name="companionName" placeholder="Acompanhante (opcional)" className={field}/><input name="companionDocument" placeholder="Doc acompanhante" className={field}/><button className="h-8 rounded bg-amber-700 font-semibold text-white">Solicitar</button></form></details>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Autorizar / Criar viagem</summary>
          <form action={authorizeTfdAction} className="mt-2 grid gap-1"><select name="requestId" required className={field}><option value="">Solicitação TFD</option>{requests.filter(r => r.status==="SOLICITADA").map(r => <option key={r.id} value={r.id}>{r.patient.person.fullName} → {r.destination}</option>)}</select><button className="h-8 rounded bg-slate-800 font-semibold text-white">Autorizar</button></form>
          <form action={createTripAction} className="mt-2 grid gap-1 border-t pt-2"><input name="date" type="date" required className={field}/><input name="origin" required placeholder="Origem" className={field}/><input name="destination" required placeholder="Destino" className={field}/><select name="fleetUnitId" required className={field}><option value="">Veículo (Frotas)</option>{fleetUnits.map(f => <option key={f.id} value={f.id}>{f.name} · {f.plate || ""}</option>)}</select><select name="driverEmployeeId" className={field}><option value="">Condutor</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><input name="capacity" type="number" min="1" required placeholder="Capacidade" className={field}/><button className="h-8 rounded bg-amber-700 font-semibold text-white">Criar viagem</button></form>
        </details>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Passageiros e movimentação</summary>
          <form action={addPassengerAction} className="mt-2 grid gap-1"><select name="tripId" required className={field}><option value="">Viagem</option>{trips.map(t => <option key={t.id} value={t.id}>{t.origin} → {t.destination} · {t.date.toLocaleDateString("pt-BR")}</option>)}</select><select name="patientId" required className={field}><option value="">Paciente</option>{patients.map(p => <option key={p.id} value={p.id}>{p.person.fullName}</option>)}</select><select name="tfdRequestId" className={field}><option value="">Sem vínculo TFD</option>{requests.map(r => <option key={r.id} value={r.id}>{r.patient.person.fullName}</option>)}</select><select name="kind" className={field}><option value="PACIENTE">Paciente</option><option value="ACOMPANHANTE">Acompanhante</option></select><input name="companionName" placeholder="Nome acompanhante se for acompanhante" className={field}/><input name="companionDocument" placeholder="Doc acompanhante" className={field}/><button className="h-8 rounded bg-amber-700 font-semibold text-white">Incluir</button></form>
          <form action={movePassengerAction} className="mt-2 grid gap-1 border-t pt-2"><select name="passengerId" required className={field}><option value="">Passageiro</option>{passengers.map(p => <option key={p.id} value={p.id}>{p.patient.person.fullName} · {p.kind}</option>)}</select><select name="targetTripId" required className={field}><option value="">Viagem destino</option>{trips.map(t => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</select><button className="h-8 rounded bg-slate-800 font-semibold text-white">Transferir</button></form>
          <form action={updateTripStatusAction} className="mt-2 grid gap-1 border-t pt-2"><select name="tripId" required className={field}><option value="">Viagem</option>{trips.map(t => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</select><select name="status" required className={field}><option value="EMBARCANDO">Embarcando</option><option value="EM_TRANSITO">Saída</option><option value="RETORNANDO">Retorno</option><option value="CONCLUIDA">Concluir</option><option value="CANCELADA">Cancelar</option></select><button className="h-8 rounded bg-slate-800 font-semibold text-white">Atualizar situação</button></form>
          <form action={requestPassengerRemovalAction} className="mt-2 grid gap-1 border-t pt-2"><select name="passengerId" required className={field}><option value="">Passageiro (exclusão com dupla custódia)</option>{passengers.map(p => <option key={p.id} value={p.id}>{p.patient.person.fullName} · {p.kind}</option>)}</select><button className="h-7 rounded border px-2">Solicitar exclusão</button></form>
          <form action={confirmPassengerRemovalAction} className="mt-2 grid gap-1 border-t pt-2"><select name="passengerId" required className={field}><option value="">Exclusão pendente</option>{removals.map(r => <option key={r.passengerId} value={r.passengerId}>{r.passenger.patient.person.fullName}</option>)}</select><select name="decision" required className={field}><option value="confirm">Confirmar (2º usuário)</option><option value="reject">Recusar</option></select><button className="h-7 rounded border px-2">Decidir</button></form>
        </details>
      </div>
      <HealthSimpleListClient rows={trips.map(t => ({ id: t.id, cells: { date: t.date.toLocaleDateString("pt-BR"), origin: t.origin, destination: t.destination, vehicle: t.fleetUnit.name, driver: t.driverEmployee?.name || "-", capacity: `${t.passengers.length}/${t.capacity}`, status: t.status } }))} columns={[{ key: "date", label: "Data", width: "medium" }, { key: "origin", label: "Origem" }, { key: "destination", label: "Destino" }, { key: "vehicle", label: "Veículo", responsive: "sm" }, { key: "driver", label: "Condutor", responsive: "md" }, { key: "capacity", label: "Lotação", width: "medium" }, { key: "status", label: "Situação", width: "medium" }]} label="viagens" searchPlaceholder="Buscar origem, destino ou veículo" filterKey="status" filterLabel="Todas" serverPagination={{ page, total, pathname: "/app-domain/saude/tfd", search: q, filter, filterOptions: ["PLANEJADA","EMBARCANDO","EM_TRANSITO","RETORNANDO","CONCLUIDA","CANCELADA"] }} />
    </PageFrame>
  );
}
