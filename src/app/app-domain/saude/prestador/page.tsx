import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { HealthSimpleListClient } from "../HealthSimpleListClient";
import { providerHistory, resolveProviderSupplier } from "@/lib/saude/provider-service";
import { executeGuideAction } from "./actions";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthRegulationRequests, healthRegulationQuotas } from "@/db/schema/health-regulation";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthSpecialties, healthServices } from "@/db/schema/health-administration";
import { healthSusProcedures } from "@/db/schema/health-catalogs";

const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const PAGE_SIZE = 20;
type Params = { q?: string | string[]; filter?: string | string[]; page?: string | string[] };
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
const num = (v: string | undefined) => v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : 1;

export default async function PrestadorPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  let supplier: Awaited<ReturnType<typeof resolveProviderSupplier>>;
  try {
    supplier = await resolveProviderSupplier(context);
  } catch {
    redirect("/saude");
  }
  const params = await searchParams;
  const q = (first(params.q) || "").trim().slice(0, 120);
  const filter = (first(params.filter) || "").trim().slice(0, 40);
  const database = context.database ?? db;
  const where = and(eq(healthRegulationQuotas.providerSupplierId, supplier.id), filter ? eq(healthRegulationRequests.status, filter) : inArray(healthRegulationRequests.status, ["AUTORIZADA", "AGENDADA", "EXECUTADA", "CONCLUIDA"]), q ? or(sql`strpos(lower(${people.fullName}), lower(${q})) > 0`, sql`strpos(lower(${healthRegulationRequests.guideNumber}), lower(${q})) > 0`) : undefined);
  const [{ total }] = await database.select({ total: count() }).from(healthRegulationRequests).innerJoin(healthRegulationQuotas, eq(healthRegulationQuotas.id, healthRegulationRequests.quotaId)).innerJoin(patients, eq(patients.id, healthRegulationRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(where);
  const page = Math.min(num(first(params.page)), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [guideRows, history] = await Promise.all([
    database.select({ id: healthRegulationRequests.id, guideNumber: healthRegulationRequests.guideNumber, status: healthRegulationRequests.status, person: { fullName: people.fullName }, specialty: { name: healthSpecialties.name }, service: { name: healthServices.name }, procedure: { code: healthSusProcedures.code } }).from(healthRegulationRequests).innerJoin(healthRegulationQuotas, eq(healthRegulationQuotas.id, healthRegulationRequests.quotaId)).innerJoin(patients, eq(patients.id, healthRegulationRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, healthRegulationRequests.specialtyId)).leftJoin(healthServices, eq(healthServices.id, healthRegulationRequests.serviceId)).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthRegulationRequests.procedureId)).where(where).orderBy(desc(healthRegulationRequests.createdAt)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    providerHistory(context, supplier.id),
  ]);
  const guides = guideRows.map(({ person, ...row }) => ({ ...row, patient: { person } }));
  const pending = guides.filter(g => ["AUTORIZADA", "AGENDADA"].includes(g.status));
  const supplierName = supplier.company?.corporateName || supplier.person?.fullName || "Prestador";

  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title={`Prestador · ${supplierName}`} icon={<Handshake className="size-4 text-indigo-700" />} />
      <details className="shrink-0 rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Registrar realização de guia própria</summary><form action={executeGuideAction} className="mt-2 grid gap-1 sm:grid-cols-3"><select name="requestId" required className={field}><option value="">Guia autorizada/agendada</option>{pending.map(g => <option key={g.id} value={g.id}>{g.guideNumber || g.id.slice(0, 8)} · {g.patient.person.fullName}</option>)}</select><input name="notes" placeholder="Resultado/observação" className={field} /><button className="h-8 rounded bg-indigo-700 px-2 font-semibold text-white">Confirmar realização</button></form></details>
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[2fr_1fr]">
        <HealthSimpleListClient rows={guides.map(g => ({ id: g.id, cells: { guide: g.guideNumber || "-", patient: g.patient.person.fullName, service: g.specialty?.name || g.service?.name || g.procedure?.code || "-", status: g.status } }))} columns={[{ key: "guide", label: "Guia", width: "medium" }, { key: "patient", label: "Paciente" }, { key: "service", label: "Serviço", responsive: "sm" }, { key: "status", label: "Situação", width: "medium" }]} label="guias" searchPlaceholder="Buscar paciente ou guia" filterKey="status" filterLabel="Todas" serverPagination={{ page, total, pathname: "/app-domain/saude/prestador", search: q, filter, filterOptions: ["AUTORIZADA", "AGENDADA", "EXECUTADA", "CONCLUIDA"] }} />
        <div className="min-h-0 overflow-y-auto rounded border bg-white p-2"><h2 className="sticky top-0 bg-white pb-2 text-xs font-bold uppercase text-slate-500">Meu histórico</h2>{history.map(h => <article key={h.id} className="mb-1 rounded border p-2 text-xs"><strong>{h.guideNumber || h.id.slice(0, 8)}</strong><p className="text-slate-500">{h.patient.person.fullName} · {h.status}</p></article>)}{history.length === 0 && <p className="text-xs text-slate-400">Sem realizações.</p>}</div>
      </div>
    </PageFrame>
  );
}
