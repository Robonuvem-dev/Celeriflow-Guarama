import { MapPin } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { HealthSimpleListClient } from "../HealthSimpleListClient";
import { addFamilyMemberAction, addVisitParticipantAction, createVisitAction, saveAreaAction, saveFamilyAction, saveHouseholdAction, saveMicroareaAction } from "./actions";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { healthHomeVisits, healthHomeVisitParticipants, healthTerritoryAreas, healthMicroareas, healthHouseholds, healthFamilies, healthFamilyMembers } from "@/db/schema/health-territory";
import { healthUnits, healthTeams, healthProfessionals } from "@/db/schema/health-workforce";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";

const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const PAGE_SIZE = 20;
type Params = { q?: string | string[]; page?: string | string[] };
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
const num = (v: string | undefined) => v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : 1;

export default async function TerritorioPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const database = context.database ?? db;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const params = await searchParams;
  const q = (first(params.q) || "").trim().slice(0, 120);
  const visitWhere = q ? or(ilike(healthHomeVisits.actions, `%${q}%`), ilike(healthFamilies.familyCode, `%${q}%`)) : undefined;
  const [{ total }] = await database.select({ total: count() }).from(healthHomeVisits).leftJoin(healthFamilies, eq(healthFamilies.id, healthHomeVisits.familyId)).where(visitWhere);
  const page = Math.min(num(first(params.page)), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [visitRows, areas, microareas, households, familyRows, units, teams, professionals, patients] = await Promise.all([
    database.select({ visit: healthHomeVisits, family: { familyCode: healthFamilies.familyCode }, household: { householdCode: healthHouseholds.householdCode }, team: { name: healthTeams.name } }).from(healthHomeVisits).leftJoin(healthFamilies, eq(healthFamilies.id, healthHomeVisits.familyId)).leftJoin(healthHouseholds, eq(healthHouseholds.id, healthHomeVisits.householdId)).leftJoin(healthTeams, eq(healthTeams.id, healthHomeVisits.teamId)).where(visitWhere).orderBy(desc(healthHomeVisits.visitedAt)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    database.select({ id: healthTerritoryAreas.id, code: healthTerritoryAreas.code, name: healthTerritoryAreas.name }).from(healthTerritoryAreas).where(unitIds ? inArray(healthTerritoryAreas.unitId, unitIds) : undefined).orderBy(asc(healthTerritoryAreas.code)),
    database.select({ id: healthMicroareas.id, code: healthMicroareas.code, area: { code: healthTerritoryAreas.code } }).from(healthMicroareas).innerJoin(healthTerritoryAreas, eq(healthTerritoryAreas.id, healthMicroareas.areaId)).orderBy(asc(healthMicroareas.code)).limit(200),
    database.select({ id: healthHouseholds.id, householdCode: healthHouseholds.householdCode }).from(healthHouseholds).orderBy(desc(healthHouseholds.createdAt)).limit(200),
    database.select({ id: healthFamilies.id, familyCode: healthFamilies.familyCode }).from(healthFamilies).orderBy(desc(healthFamilies.createdAt)).limit(200),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    database.select({ id: healthTeams.id, name: healthTeams.name }).from(healthTeams).where(and(eq(healthTeams.isActive, true), unitIds ? inArray(healthTeams.unitId, unitIds) : undefined)).orderBy(asc(healthTeams.name)),
    database.select({ id: healthProfessionals.id }).from(healthProfessionals).where(eq(healthProfessionals.isActive, true)).orderBy(asc(healthProfessionals.id)).limit(200),
    database.select({ personId: patientTable.personId, person: { fullName: people.fullName } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).where(and(eq(patientTable.status, "Ativo"), unitIds ? inArray(patientTable.referenceUnitId, unitIds) : undefined)).orderBy(asc(people.fullName)).limit(300),
  ]);
  const [members, participants] = await Promise.all([
    database.select({ id: healthFamilyMembers.id, familyId: healthFamilyMembers.familyId }).from(healthFamilyMembers).where(inArray(healthFamilyMembers.familyId, familyRows.map(row => row.id))),
    database.select({ id: healthHomeVisitParticipants.id, visitId: healthHomeVisitParticipants.visitId }).from(healthHomeVisitParticipants).where(inArray(healthHomeVisitParticipants.visitId, visitRows.map(row => row.visit.id))),
  ]);
  const visits = visitRows.map(row => ({ ...row.visit, family: row.family, household: row.household, team: row.team, participants: participants.filter(participant => participant.visitId === row.visit.id) })), families = familyRows.map(row => ({ ...row, members: members.filter(member => member.familyId === row.id) }));

  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Território e Visitas" icon={<MapPin className="size-4 text-emerald-700" />} />
      <div className="grid shrink-0 gap-2 lg:grid-cols-4">
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Área / Microárea</summary>
          <form action={saveAreaAction} className="mt-2 grid gap-1"><input name="code" required placeholder="Código da área" className={field}/><input name="name" required placeholder="Nome" className={field}/><select name="unitId" className={field}><option value="">Unidade</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select><select name="teamId" className={field}><option value="">Equipe</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><button className="h-8 rounded bg-emerald-700 font-semibold text-white">Salvar área</button></form>
          <form action={saveMicroareaAction} className="mt-2 grid gap-1 border-t pt-2"><select name="areaId" required className={field}><option value="">Área</option>{areas.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select><input name="code" required placeholder="Código microárea" className={field}/><button className="h-8 rounded bg-slate-800 font-semibold text-white">Salvar microárea</button></form>
        </details>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Domicílio / Família</summary>
          <form action={saveHouseholdAction} className="mt-2 grid gap-1"><input name="householdCode" placeholder="Código domiciliar e-SUS" className={field}/><select name="microareaId" className={field}><option value="">Microárea</option>{microareas.map(m => <option key={m.id} value={m.id}>{m.area.code}/{m.code}</option>)}</select><button className="h-8 rounded bg-emerald-700 font-semibold text-white">Salvar domicílio</button></form>
          <form action={saveFamilyAction} className="mt-2 grid gap-1 border-t pt-2"><input name="familyCode" placeholder="Código familiar e-SUS" className={field}/><select name="householdId" className={field}><option value="">Domicílio</option>{households.map(h => <option key={h.id} value={h.id}>{h.householdCode || h.id.slice(0,8)}</option>)}</select><button className="h-8 rounded bg-slate-800 font-semibold text-white">Criar família</button></form>
          <form action={addFamilyMemberAction} className="mt-2 grid gap-1 border-t pt-2"><select name="familyId" required className={field}><option value="">Família</option>{families.map(f => <option key={f.id} value={f.id}>{f.familyCode || f.id.slice(0,8)} ({f.members.length})</option>)}</select><select name="personId" required className={field}><option value="">Pessoa (usa cadastro único)</option>{patients.map(p => <option key={p.personId} value={p.personId}>{p.person.fullName}</option>)}</select><input name="kinship" placeholder="Parentesco" className={field}/><button className="h-8 rounded bg-emerald-700 font-semibold text-white">Vincular membro</button></form>
        </details>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Nova visita</summary><form action={createVisitAction} className="mt-2 grid gap-1"><select name="householdId" className={field}><option value="">Domicílio</option>{households.map(h => <option key={h.id} value={h.id}>{h.householdCode || h.id.slice(0,8)}</option>)}</select><select name="familyId" className={field}><option value="">Família</option>{families.map(f => <option key={f.id} value={f.id}>{f.familyCode || f.id.slice(0,8)}</option>)}</select><select name="professionalId" required className={field}><option value="">Agente/profissional</option>{professionals.map(p => <option key={p.id} value={p.id}>{p.id.slice(0,8)}</option>)}</select><select name="teamId" className={field}><option value="">Equipe</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><select name="microareaId" className={field}><option value="">Microárea</option>{microareas.map(m => <option key={m.id} value={m.id}>{m.area.code}/{m.code}</option>)}</select><input name="visitedAt" type="datetime-local" required className={field}/><textarea name="actions" required placeholder="Ações realizadas" className="min-h-12 rounded border p-2"/><input name="observations" placeholder="Observações permitidas" className={field}/><button className="h-8 rounded bg-emerald-700 font-semibold text-white">Registrar visita</button></form></details>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Participantes da visita</summary><form action={addVisitParticipantAction} className="mt-2 grid gap-1"><select name="visitId" required className={field}><option value="">Visita</option>{visits.map(v => <option key={v.id} value={v.id}>{v.visitedAt.toLocaleDateString("pt-BR")} · {v.actions.slice(0,30)}</option>)}</select><select name="personId" required className={field}><option value="">Pessoa atendida</option>{patients.map(p => <option key={p.personId} value={p.personId}>{p.person.fullName}</option>)}</select><p className="text-[10px] text-slate-500">1 visita pode ter N participantes; evento e participações ficam separados.</p><button className="h-8 rounded bg-slate-800 font-semibold text-white">Adicionar participante</button></form></details>
      </div>
      <HealthSimpleListClient rows={visits.map(v => ({ id: v.id, cells: { date: v.visitedAt.toLocaleDateString("pt-BR"), family: v.family?.familyCode || v.household?.householdCode || "-", team: v.team?.name || "-", actions: v.actions.slice(0,60), participants: String(v.participants.length), status: v.status } }))} columns={[{ key: "date", label: "Data", width: "medium" }, { key: "family", label: "Família/Domicílio" }, { key: "team", label: "Equipe", responsive: "sm" }, { key: "actions", label: "Ações" }, { key: "participants", label: "Pessoas", width: "narrow" }, { key: "status", label: "Situação", width: "medium" }]} label="visitas" searchPlaceholder="Buscar ação ou família" serverPagination={{ page, total, pathname: "/app-domain/saude/territorio", search: q }} />
    </PageFrame>
  );
}
