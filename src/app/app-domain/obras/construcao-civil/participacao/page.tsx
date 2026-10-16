import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import ConstructionParticipationClient from "./ConstructionParticipationClient";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function ConstructionParticipationPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.includes("MANAGER")) notFound();
  const query = await searchParams; const q = (query.q || "").trim().slice(0, 100);
  const where = { case: { AND: [constructionCaseWhere(access), ...(q ? [{ process: { protocolNumber: { contains: q, mode: "insensitive" as const } } }] : [])] } };
  const total = await context.prisma.constructionParticipant.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const [participants, identities, professionals, cases, term] = await Promise.all([
    context.prisma.constructionParticipant.findMany({ where, include: { identity: { select: { professional: { select: { person: { select: { fullName: true } } } } } }, case: { select: { process: { select: { protocolNumber: true } } } } }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }),
    context.prisma.constructionPortalIdentity.findMany({ where: { isActive: true }, select: { id: true, professional: { select: { person: { select: { fullName: true } } } } } }),
    access.administrator ? context.prisma.constructionProfessional.findMany({ include: { person: { select: { fullName: true } }, portalIdentity: { select: { firebaseUid: true, email: true, isActive: true } } }, orderBy: { person: { fullName: "asc" } } }) : [],
    context.prisma.constructionCase.findMany({ where: constructionCaseWhere(access), select: { id: true, process: { select: { protocolNumber: true } } }, orderBy: { createdAt: "desc" } }),
    context.prisma.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true, text: true } }),
  ]);
  const href = (target: number) => `?${new URLSearchParams({ q, page: String(target) })}`;
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Participação e acesso profissional" /><ConstructionParticipationClient administrator={access.administrator} identities={identities.map((identity) => ({ id: identity.id, name: identity.professional.person.fullName }))} professionals={professionals.map((professional) => ({ id: professional.id, name: professional.person.fullName, identity: professional.portalIdentity }))} cases={cases.map((item) => ({ id: item.id, name: item.process.protocolNumber }))} term={term} /><section className="rounded border"><form className="flex gap-2 border-b p-2"><input name="q" defaultValue={q} placeholder="Buscar protocolo" aria-label="Buscar protocolo" className="min-w-0 flex-1 rounded border bg-transparent px-2 text-sm" /><button className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Filtrar</button></form><table className="w-full table-fixed text-left text-xs"><thead><tr><th className="p-2">Protocolo</th><th className="p-2">Profissional</th><th className="p-2">Papel</th><th className="p-2">Situação</th></tr></thead><tbody>{participants.map((participant) => <tr key={participant.id} className="h-9 border-t"><td className="truncate p-2">{participant.case.process.protocolNumber}</td><td className="truncate p-2">{participant.identity.professional.person.fullName}</td><td className="p-2">{participant.role}</td><td className="p-2">{participant.isActive ? "Ativo" : "Encerrado"}</td></tr>)}</tbody></table><div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="participações" /></div></section></PageFrame>;
}
