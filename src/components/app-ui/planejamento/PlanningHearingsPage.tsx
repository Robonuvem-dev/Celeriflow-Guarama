import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { PlanningForm } from "./PlanningForm";
import { getPlanningContext, planningInstrumentWhere, planningUnitWhere } from "@/lib/planejamento/access";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { planningBasePath, type PlanningJurisdiction } from "@/lib/planejamento/policy";

export async function PlanningHearingsPage({ jurisdiction, filters }: { jurisdiction: PlanningJurisdiction; filters: { hearingId?: string; page?: string } }) {
  const context = await getPlanningContext(jurisdiction);
  const base = `${planningBasePath(jurisdiction)}/audiencias`;
  const where = { hearing: { instrument: planningInstrumentWhere(context) }, responsibleUnit: planningUnitWhere(context), ...(filters.hearingId ? { hearingId: filters.hearingId } : {}) };
  const total = await context.prisma.planningCommunityDemand.count({ where });
  const requested = Number(filters.page ?? 1);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const [hearings, instruments, units, demands] = await Promise.all([
    context.prisma.planningHearing.findMany({ where: { instrument: planningInstrumentWhere(context) }, select: { id: true, title: true, heldAt: true, location: true, minutes: true }, orderBy: [{ heldAt: "desc" }, { id: "asc" }] }),
    context.prisma.planningInstrument.findMany({ where: planningInstrumentWhere(context), select: { id: true, title: true }, orderBy: [{ startYear: "desc" }, { id: "asc" }] }),
    context.prisma.budgetUnit.findMany({ where: planningUnitWhere(context), select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.planningCommunityDemand.findMany({ where, include: { hearing: { select: { title: true } }, responsibleUnit: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 }),
  ]);
  const hearingOptions = hearings.map((row) => ({ id: row.id, name: `${row.title} · ${row.heldAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` }));
  const href = (value: number) => `${base}?${new URLSearchParams({ hearingId: filters.hearingId ?? "", page: String(value) })}`;
  const selected = hearings.find((hearing) => hearing.id === filters.hearingId);
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Audiências e participação comunitária" />
    <form className="flex flex-wrap gap-2"><select aria-label="Audiência" name="hearingId" defaultValue={filters.hearingId} className="rounded border bg-background p-2 text-sm"><option value="">Todas autorizadas</option>{hearingOptions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button className="rounded border px-3 text-sm">Consultar</button></form>
    {selected && <Card><CardHeader><CardTitle>{selected.title}</CardTitle></CardHeader><CardContent><p className="text-xs">{selected.location} · {selected.heldAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p><p className="whitespace-pre-wrap text-sm">{selected.minutes}</p></CardContent></Card>}
    <Card><CardContent className="pt-3"><Table><TableHeader><TableRow><TableHead>Solicitante / contato</TableHead><TableHead>Bairro / demanda</TableHead><TableHead>Órgão responsável</TableHead><TableHead>Situação / parecer</TableHead></TableRow></TableHeader><TableBody>{demands.map((demand) => <TableRow key={demand.id}><TableCell>{demand.requesterName}<p className="text-xs">{demand.email} {demand.phone}</p></TableCell><TableCell>{demand.neighborhood}<p className="text-xs">{demand.request}</p></TableCell><TableCell>{demand.responsibleUnit.name}<p className="text-xs">{demand.hearing.title}</p></TableCell><TableCell>{({ PENDING: "Em análise", ACCEPTED: "Acolhida", REJECTED: "Não acolhida" } as Record<string, string>)[demand.status]}<p className="text-xs">{demand.opinion}</p>{demand.status === "PENDING" && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") && <details className="mt-2"><summary className="cursor-pointer text-xs">Analisar solicitação</summary><PlanningForm jurisdiction={jurisdiction} operation="demandDecision" hidden={{ demandId: demand.id }} fields={[{ name: "status", label: "Decisão", type: "select", options: [{ id: "ACCEPTED", name: "Acolher" }, { id: "REJECTED", name: "Não acolher" }] }, { name: "opinion", label: "Parecer", type: "textarea" }]} /></details>}</TableCell></TableRow>)}{!demands.length && <TableRow><TableCell colSpan={4} className="py-8 text-center">Nenhuma solicitação encontrada.</TableCell></TableRow>}</TableBody></Table><ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)} /></CardContent></Card>
    {canPerformModuleOperation(context.user, "PLANEJAMENTO", "create") && <>
      <details className="rounded border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Registrar audiência</summary><div className="pt-3"><PlanningForm jurisdiction={jurisdiction} operation="hearing" fields={[{ name: "instrumentId", label: "Peça orçamentária", type: "select", options: instruments.map((row) => ({ id: row.id, name: row.title })) }, { name: "title", label: "Tema" }, { name: "heldAt", label: "Data de realização", type: "date" }, { name: "location", label: "Local" }, { name: "minutes", label: "Ata", type: "textarea", required: false }]} /></div></details>
      <details className="rounded border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Registrar solicitação da comunidade</summary><div className="pt-3"><PlanningForm jurisdiction={jurisdiction} operation="demand" fields={[{ name: "hearingId", label: "Audiência", type: "select", options: hearingOptions }, { name: "requesterName", label: "Solicitante" }, { name: "email", label: "E-mail", type: "email", required: false }, { name: "phone", label: "Telefone", required: false }, { name: "neighborhood", label: "Bairro" }, { name: "responsibleUnitId", label: "Órgão responsável", type: "select", options: units }, { name: "request", label: "Solicitação", type: "textarea" }]} /></div></details>
    </>}
  </PageFrame>;
}
