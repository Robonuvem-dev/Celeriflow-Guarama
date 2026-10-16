import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { publicationPayloadSchema } from "@/lib/portal-servidor/document-publication";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { FunctionalPublicationForm, FunctionalRevocationForm } from "./PublicationForm";

export const dynamic = "force-dynamic";
export default async function FunctionalPublicationAdministration({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports"), params = await searchParams;
  const where = { domain: "PORTAL", eventType: "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO", ...(!isSystemAdministrator(context.user) ? { OR: context.user.allowedBudgetUnitIds.map(id => ({ payload: { path: ["budgetUnitId"], equals: id } })) } : {}) };
  const total = await context.prisma.hrIntegrationEvent.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const events = await context.prisma.hrIntegrationEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Publicações funcionais do RH" description="Disponibilize documentos de origem para o titular, com versão, data de liberação e revogação." /><FunctionalPublicationForm />{events.map(event => { const payload = publicationPayloadSchema.parse(event.payload); return <article key={event.id} className="rounded border border-slate-300 bg-white p-3 text-xs"><h2 className="font-semibold">{payload.title} · {payload.kind}</h2><p>Titular: {payload.employeeId} · UG: {payload.budgetUnitId} · {event.status === "REVOGADO" ? "Revogado" : new Date(payload.releaseAt) > new Date() ? "Liberação agendada" : "Disponível"}</p><p>Origem: {payload.sourceReference}</p>{event.status !== "REVOGADO" && <FunctionalRevocationForm id={event.id} />}</article>; })}<ErpPagination page={page} total={total} pageSize={20} label="publicações" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} /></div>;
}
