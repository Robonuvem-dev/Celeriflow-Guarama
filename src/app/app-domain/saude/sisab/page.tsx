import { Send } from "lucide-react";
import { db as defaultDatabase } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { HealthSimpleListClient } from "../HealthSimpleListClient";
import { createBatchAction, finalizeFormAction, processBatchAction } from "./actions";
import SisabFormClient from "./SisabFormClient";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { healthEsusForms, healthHouseholds, healthFamilies } from "@/db/schema/health-territory";
import { diagnosticEsusBatches, diagnosticEsusBatchItems } from "@/db/schema/health-diagnostics";
import { healthUnits, healthTeams, healthProfessionals } from "@/db/schema/health-workforce";
import { medicalRecords } from "@/db/schema/health-care";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { pharmacyPatients } from "@/db/repositories/health-pharmacy-pages/common";

const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const PAGE_SIZE = 20;
const KINDS = ["INDIVIDUAL","DOMICILIAR","VISITA","ATENDIMENTO_INDIVIDUAL","ODONTO","ATIVIDADE_COLETIVA","PROCEDIMENTOS","CONSUMO_ALIMENTAR","ATENDIMENTO_DOMICILIAR","OUTRO"];
type Params = { q?: string | string[]; filter?: string | string[]; page?: string | string[] };
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
const num = (v: string | undefined) => v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : 1;

export default async function SisabPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const db = context.database ?? defaultDatabase;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const params = await searchParams;
  const q = (first(params.q) || "").trim().slice(0, 120);
  const filter = (first(params.filter) || "").trim().slice(0, 40);
  const where = and(unitIds ? inArray(healthEsusForms.unitId, unitIds) : undefined, filter ? eq(healthEsusForms.kind, filter) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(healthEsusForms).where(where);
  const page = Math.min(num(first(params.page)), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const patientPerson = alias(people, "sisab_patient_person");
  const [formRows, batchRows, patients, units, teams, professionals, households, families, recordRows] = await Promise.all([
    db.select({ form: healthEsusForms, patient: patientTable, patientPerson, person: people, unit: healthUnits, professional: { id: healthProfessionals.id } }).from(healthEsusForms).leftJoin(patientTable, eq(patientTable.id, healthEsusForms.patientId)).leftJoin(patientPerson, eq(patientPerson.id, patientTable.personId)).leftJoin(people, eq(people.id, healthEsusForms.personId)).leftJoin(healthUnits, eq(healthUnits.id, healthEsusForms.unitId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthEsusForms.professionalId)).where(where).orderBy(desc(healthEsusForms.createdAt)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    db.select().from(diagnosticEsusBatches).orderBy(desc(diagnosticEsusBatches.createdAt)).limit(50),
    pharmacyPatients(db, unitIds, undefined, 300),
    db.select().from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    db.select().from(healthTeams).where(and(eq(healthTeams.isActive, true), unitIds ? inArray(healthTeams.unitId, unitIds) : undefined)).orderBy(asc(healthTeams.name)),
    db.select().from(healthProfessionals).where(eq(healthProfessionals.isActive, true)).limit(200),
    db.select().from(healthHouseholds).orderBy(desc(healthHouseholds.createdAt)).limit(200),
    db.select().from(healthFamilies).orderBy(desc(healthFamilies.createdAt)).limit(200),
    db.select({ record: medicalRecords, patient: patientTable, person: people }).from(medicalRecords).innerJoin(patientTable, eq(patientTable.id, medicalRecords.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).where(unitIds ? inArray(medicalRecords.unitId, unitIds) : undefined).orderBy(desc(medicalRecords.date)).limit(200),
  ]);
  const batchItems = await db.select({ batchId: diagnosticEsusBatchItems.batchId, status: diagnosticEsusBatchItems.status }).from(diagnosticEsusBatchItems).where(inArray(diagnosticEsusBatchItems.batchId, batchRows.map(row => row.id)));
  const batches = batchRows.map(row => ({ ...row, items: batchItems.filter(item => item.batchId === row.id).slice(0, 5).map(({ status }) => ({ status })) }));
  const forms = formRows.map(row => ({ ...row.form, patient: row.patient && row.patientPerson ? { ...row.patient, person: row.patientPerson } : null, person: row.person, unit: row.unit, professional: row.professional }));
  const records = recordRows.map(row => ({ ...row.record, patient: { ...row.patient, person: row.person } }));

  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="SISAB / e-SUS" icon={<Send className="size-4 text-sky-700" />} />
      <div className="grid shrink-0 gap-2 lg:grid-cols-3">
        <SisabFormClient patients={patients.map(p => ({ id: p.id, label: p.person.fullName }))} households={households.map(h => ({ id: h.id, label: h.householdCode || h.id.slice(0, 8) }))} families={families.map(f => ({ id: f.id, label: f.familyCode || f.id.slice(0, 8) }))} professionals={professionals.map(p => ({ id: p.id, label: p.id.slice(0, 8) }))} teams={teams.map(t => ({ id: t.id, label: t.name }))} units={units.map(u => ({ id: u.id, label: u.name }))} records={records.map(r => ({ id: r.id, label: `${r.patient.person.fullName} · ${r.date.toLocaleDateString("pt-BR")}` }))} />
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Finalizar ficha (gera produção)</summary><form action={finalizeFormAction} className="mt-2 grid gap-1"><select name="formId" required className={field}><option value="">Ficha em rascunho</option>{forms.filter(f => f.status==="RASCUNHO").map(f => <option key={f.id} value={f.id}>{f.kind} · {f.period}</option>)}</select><p className="text-[10px] text-slate-500">Finalizar cria fato de produção idempotente (reprocessar não duplica).</p><button className="h-8 rounded bg-slate-800 font-semibold text-white">Finalizar</button></form></details>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Lotes e exportação</summary>
          <form action={createBatchAction} className="mt-2 grid gap-1"><input name="competence" type="month" required className={field}/><button className="h-8 rounded bg-sky-700 font-semibold text-white">Gerar lote da competência</button></form>
          <form action={processBatchAction} className="mt-2 grid gap-1 border-t pt-2"><select name="batchId" required className={field}><option value="">Lote</option>{batches.map(b => <option key={b.id} value={b.id}>{b.competence} · {b.status} · {b.total}</option>)}</select><p className="text-[10px] text-slate-500">Adaptador controlado: valida, devolve aceites/rejeições, permite corrigir e reenviar.</p><button className="h-8 rounded bg-slate-800 font-semibold text-white">Processar lote</button></form>
        </details>
      </div>
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[2fr_1fr]">
        <HealthSimpleListClient rows={forms.map(f => ({ id: f.id, cells: { kind: f.kind, citizen: f.patient?.person.fullName || f.person?.fullName || "-", unit: f.unit?.name || "-", period: f.period, status: f.status } }))} columns={[{ key: "kind", label: "Ficha", width: "medium" }, { key: "citizen", label: "Cidadão" }, { key: "unit", label: "Unidade", responsive: "sm" }, { key: "period", label: "Comp.", width: "narrow" }, { key: "status", label: "Situação", width: "medium" }]} label="fichas" searchPlaceholder="Buscar ficha" filterKey="kind" filterLabel="Todas" serverPagination={{ page, total, pathname: "/app-domain/saude/sisab", search: q, filter, filterOptions: KINDS }} />
        <div className="min-h-0 overflow-y-auto rounded border bg-white p-2"><h2 className="sticky top-0 bg-white pb-2 text-xs font-bold uppercase text-slate-500">Lotes</h2>{batches.map(b => <article key={b.id} className="mb-2 rounded border p-2 text-xs"><strong>{b.competence} · {b.status}</strong><p className="text-slate-500">Total {b.total} · Aceitos {b.accepted} · Rejeitados {b.rejected}</p><p className="truncate text-slate-400" title={b.hash}>hash {b.hash.slice(0,16)}…</p><a className="mt-1 inline-block rounded border px-2 py-1" href={`/api/saude/sisab/lotes/${b.id}`}>Baixar lote</a>{Array.isArray(b.errors) && (b.errors as unknown[]).length > 0 && <p className="mt-1 text-rose-600">Corrija a(s) ficha(s) rejeitada(s) e reenvie: gere novo lote ou reprocesse.</p>}</article>)}{batches.length===0 && <p className="text-xs text-slate-400">Nenhum lote gerado.</p>}</div>
      </div>
    </PageFrame>
  );
}
