import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { latestPageTerm, listPageCaseOptions, loadPageParticipations } from "@/db/repositories/works-pages/cases";
import { listPagePortalIdentities, listPagePortalProfessionals } from "@/db/repositories/works-pages/professionals";
import ConstructionParticipationClient from "./ConstructionParticipationClient";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function ConstructionParticipationPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.includes("MANAGER")) notFound();
  const query = await searchParams; const q = (query.q || "").trim().slice(0, 100);
  const database = context.database ?? db;
  const { total, page, participants } = await loadPageParticipations(database, access, q, query.page);
  const [identities, professionals, cases, term] = await Promise.all([
    listPagePortalIdentities(database),
    access.administrator ? listPagePortalProfessionals(database) : [],
    listPageCaseOptions(database, access),
    latestPageTerm(database),
  ]);
  const href = (target: number) => `?${new URLSearchParams({ q, page: String(target) })}`;
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Participação e acesso profissional" /><ConstructionParticipationClient administrator={access.administrator} identities={identities.map((identity) => ({ id: identity.id, name: identity.professional.person.fullName }))} professionals={professionals.map((professional) => ({ id: professional.id, name: professional.person.fullName, identity: professional.portalIdentity }))} cases={cases.map((item) => ({ id: item.id, name: item.process.protocolNumber }))} term={term} /><section className="rounded border"><form className="flex gap-2 border-b p-2"><input name="q" defaultValue={q} placeholder="Buscar protocolo" aria-label="Buscar protocolo" className="min-w-0 flex-1 rounded border bg-transparent px-2 text-sm" /><button className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Filtrar</button></form><table className="w-full table-fixed text-left text-xs"><thead><tr><th className="p-2">Protocolo</th><th className="p-2">Profissional</th><th className="p-2">Papel</th><th className="p-2">Situação</th></tr></thead><tbody>{participants.map((participant) => <tr key={participant.id} className="h-9 border-t"><td className="truncate p-2">{participant.case.process.protocolNumber}</td><td className="truncate p-2">{participant.identity.professional.person.fullName}</td><td className="p-2">{participant.role}</td><td className="p-2">{participant.isActive ? "Ativo" : "Encerrado"}</td></tr>)}</tbody></table><div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="participações" /></div></section></PageFrame>;
}
