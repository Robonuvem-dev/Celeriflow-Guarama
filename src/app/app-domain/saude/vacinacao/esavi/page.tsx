import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { healthVaccineAdverseEvents as adverseEvents, healthVaccineAdverseFollowups as followups, vaccines, vaccinationRecords } from "@/db/schema/health-vaccination";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits } from "@/db/schema/health-workforce";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
const severityNames: Record<string, string> = { MILD: "Leve", MODERATE: "Moderada", SEVERE: "Grave" };
export default async function VaccineAdverseEventsPage({ searchParams }: { searchParams: Promise<{ q?: string; severity?: string; page?: string }> }) {
  const { q = "", severity = "", page: rawPage } = await searchParams, context = await getTenantContextForModule("SAUDE");
  const units = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const db = context.database;
  const where = and(units ? inArray(adverseEvents.unitId, units) : undefined, severityNames[severity] ? eq(adverseEvents.severity, severity) : undefined, q ? or(ilike(people.fullName, `%${q}%`), ilike(vaccines.name, `%${q}%`), ilike(adverseEvents.eventType, `%${q}%`), ilike(adverseEvents.lesionType, `%${q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(adverseEvents).innerJoin(patientTable, eq(patientTable.id, adverseEvents.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(vaccines, eq(vaccines.id, adverseEvents.vaccineId)).where(where);
  const page = Math.min(Math.max(1, Number.parseInt(rawPage || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const [eventRows, patients] = await Promise.all([
    db.select({ event: adverseEvents, patient: patientTable, person: { fullName: people.fullName }, vaccine: vaccines, unit: { name: healthUnits.name } }).from(adverseEvents).innerJoin(patientTable, eq(patientTable.id, adverseEvents.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(vaccines, eq(vaccines.id, adverseEvents.vaccineId)).innerJoin(healthUnits, eq(healthUnits.id, adverseEvents.unitId)).where(where).orderBy(desc(adverseEvents.occurredAt), desc(adverseEvents.id)).limit(20).offset((page - 1) * 20),
    db.select({ id: patientTable.id, person: { fullName: people.fullName } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).where(and(ne(patientTable.status, "Unificado"), units ? or(inArray(patientTable.referenceUnitId, units), sql`EXISTS (SELECT 1 FROM ${vaccinationRecords} WHERE ${vaccinationRecords.patientId}=${patientTable.id} AND ${inArray(vaccinationRecords.unitId, units)})`) : undefined, q ? ilike(people.fullName, `%${q}%`) : undefined)).orderBy(asc(people.fullName)).limit(50),
  ]);
  const latestConducts = await db.select().from(followups).where(inArray(followups.eventId, eventRows.map(row => row.event.id))).orderBy(desc(followups.occurredAt));
  const events = eventRows.map(row => ({ ...row.event, patient: { ...row.patient, person: row.person }, vaccine: row.vaccine, unit: row.unit, followups: latestConducts.filter(item => item.eventId === row.event.id).slice(0, 1) }));
  const href = (next: number) => `/saude/vacinacao/esavi?${new URLSearchParams({ q, severity, page: String(next) })}`;
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"><header className="flex flex-wrap justify-between gap-3"><h1 className="font-semibold">ESAVI — eventos adversos e condutas</h1><Link href="/saude/vacinacao" className="text-sm underline">Vacinação</Link></header>
    <form className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">Paciente, imunobiológico, evento ou lesão<input name="q" defaultValue={q} className="rounded border p-2" /></label><label className="grid gap-1 text-sm">Gravidade<select name="severity" defaultValue={severity} className="rounded border p-2"><option value="">Todas</option>{Object.entries(severityNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><button className="rounded border p-2 text-sm">Pesquisar</button></form>
    <details className="rounded border bg-white p-3"><summary className="font-semibold">Selecionar paciente para registrar novo evento</summary><p className="mt-2 text-sm">Pesquise o nome acima e abra a carteira para vincular o imunobiológico, a aplicação e a avaliação.</p>{patients.map(patient => <p key={patient.id} className="mt-1 text-sm"><Link href={`/saude/vacinacao/carteira/${encodeURIComponent(patient.id)}`} className="underline">{patient.person.fullName} · abrir carteira e registrar ESAVI</Link></p>)}</details>
    <p className="text-sm">{total} evento(s) · página {page}</p>{events.map(event => <article key={event.id} className="space-y-2 rounded border bg-white p-3 text-sm"><h2 className="font-semibold">{event.patient.person.fullName} · {event.vaccine.name} · {severityNames[event.severity]}</h2><p>{event.occurredAt.toLocaleString("pt-BR")} · {event.unit.name} · {event.eventType}</p><p>{event.lesionType} · {event.lesionLocation} · {event.clinicalNotes}</p>{event.followups[0] && <p>Última conduta: {event.followups[0].conduct} · {event.followups[0].occurredAt.toLocaleString("pt-BR")}</p>}<Link href={`/saude/vacinacao/carteira/${encodeURIComponent(event.patientId)}`} className="underline">Abrir origem e acrescentar conduta ao histórico</Link></article>)}
    <nav className="flex gap-3 text-sm">{page > 1 && <Link href={href(page - 1)} className="underline">Anterior</Link>}{page * 20 < total && <Link href={href(page + 1)} className="underline">Próxima</Link>}</nav>
  </div>;
}
