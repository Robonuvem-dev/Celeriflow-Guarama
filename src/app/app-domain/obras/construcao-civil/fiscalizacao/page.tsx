import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { enforcementCaseWhere } from "@/lib/obras/construction-enforcement-policy";
import { ConstructionEnforcementOpening } from "./ConstructionEnforcementClient";

export default async function ConstructionEnforcementPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; locationType?: string; permitStatus?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 160);
  const status = ["OPEN", "EMBARGOED"].includes(params.status || "") ? params.status! : "";
  const locationType = ["URBAN", "RURAL"].includes(params.locationType || "") ? params.locationType! : "";
  const permitStatus = ["WITHOUT_PERMIT", "REPORTED_PERMIT", "UNKNOWN"].includes(params.permitStatus || "") ? params.permitStatus! : "";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const canOpen = access.administrator || access.roles.some((role) => ["INSPECTOR", "MANAGER"].includes(role));
  const where = { AND: [enforcementCaseWhere(access), { ...(status ? { status } : {}), ...(locationType ? { locationType } : {}), ...(permitStatus ? { permitStatus } : {}) }, ...(q ? [{ OR: [{ process: { protocolNumber: { contains: q, mode: "insensitive" as const } } }, { realEstate: { municipalInsc: { contains: q, mode: "insensitive" as const } } }, { realEstate: { streetName: { contains: q, mode: "insensitive" as const } } }] }] : [])] };
  const total = await context.prisma.constructionEnforcementCase.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const [cases, properties, subjects, permits, persons, companies] = await Promise.all([
    context.prisma.constructionEnforcementCase.findMany({ where, include: { process: { select: { protocolNumber: true, status: true, currentDepartment: { select: { name: true } } } }, realEstate: { select: { municipalInsc: true, streetName: true, number: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }),
    canOpen ? context.prisma.realEstate.findMany({ where: q ? { OR: [{ municipalInsc: { contains: q, mode: "insensitive" } }, { streetName: { contains: q, mode: "insensitive" } }, { registration: { contains: q, mode: "insensitive" } }] } : {}, select: { id: true, municipalInsc: true, streetName: true, number: true }, orderBy: { municipalInsc: "asc" }, take: 100 }) : [],
    canOpen ? context.prisma.subject.findMany({ where: { isActive: true, allowsInternalOpening: true, processType: { isActive: true, allowsInternalOpening: true } }, select: { id: true, name: true, processTypeId: true, processType: { select: { name: true } } }, orderBy: { name: "asc" } }) : [],
    canOpen ? context.prisma.constructionCase.findMany({ where: { AND: [constructionCaseWhere(access), { category: "BUILDING" }] }, select: { id: true, process: { select: { protocolNumber: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
    canOpen ? context.prisma.person.findMany({ where: { status: "Ativo" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 200 }) : [],
    canOpen ? context.prisma.company.findMany({ where: { status: "Ativo" }, select: { id: true, corporateName: true }, orderBy: { corporateName: "asc" }, take: 200 }) : [],
  ]);
  const href = (target: number) => `?${new URLSearchParams({ q, status, locationType, permitStatus, page: String(target) })}`;
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Construção Civil — Fiscalização edilícia / posturas" icon={<ShieldCheck className="size-4" />} action={<Link href="/obras/construcao-civil" className="text-xs text-blue-700 underline">Solicitações de obra</Link>} />
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">DEMONSTRATIVO — fiscalização urbana e rural, inclusive SEM ALVARÁ. Atos e fundamentos informados não constituem modelos legais oficiais. Fiscalização edilícia não altera ISS nem gera multa tributária.</p>
    <form className="flex flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1 text-xs">Buscar protocolo, inscrição ou endereço<input name="q" defaultValue={q} className="mt-1 w-full rounded border bg-transparent p-2" placeholder="Também filtra imóveis para abertura" /></label>
      <label className="text-xs">Situação<select name="status" defaultValue={status} className="mt-1 block rounded border bg-transparent p-2"><option value="">Todas</option><option value="OPEN">Em fiscalização</option><option value="EMBARGOED">Embargada</option></select></label>
      <label className="text-xs">Localização<select name="locationType" defaultValue={locationType} className="mt-1 block rounded border bg-transparent p-2"><option value="">Todas</option><option value="URBAN">Urbana</option><option value="RURAL">Rural</option></select></label>
      <label className="text-xs">Alvará<select name="permitStatus" defaultValue={permitStatus} className="mt-1 block rounded border bg-transparent p-2"><option value="">Todos</option><option value="WITHOUT_PERMIT">SEM ALVARÁ</option><option value="REPORTED_PERMIT">Alvará informado</option><option value="UNKNOWN">Não verificado</option></select></label>
      <button className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Filtrar</button>
    </form>
    {canOpen && <ConstructionEnforcementOpening properties={properties.map((item) => ({ id: item.id, label: `${item.municipalInsc || item.id} — ${item.streetName || "Sem endereço"}, ${item.number || "s/n"}` }))} subjects={subjects.map((item) => ({ id: item.id, label: `${item.processType.name} / ${item.name}`, processTypeId: item.processTypeId }))} permits={permits.map((item) => ({ id: item.id, label: item.process.protocolNumber }))} persons={persons.map((item) => ({ id: item.id, label: item.fullName }))} companies={companies.map((item) => ({ id: item.id, label: item.corporateName }))} />}
    <section className="rounded border">
      <table className="w-full table-fixed text-left text-xs [&_td]:break-words"><thead className="bg-slate-100 dark:bg-slate-800"><tr><th className="p-2">Processo / imóvel</th><th className="hidden p-2 sm:table-cell">Setor</th><th className="p-2">Alvará / localização</th><th className="p-2">Situação</th><th className="w-16 p-2">Ação</th></tr></thead>
        <tbody>{cases.map((item) => <tr key={item.id} className="border-t"><td className="p-2"><p className="font-medium">{item.process.protocolNumber}</p><p>{item.realEstate.municipalInsc || "Sem inscrição"} — {item.realEstate.streetName}, {item.realEstate.number || "s/n"}</p></td><td className="hidden p-2 sm:table-cell">{item.process.currentDepartment?.name || "—"}</td><td className="p-2">{item.permitStatus === "WITHOUT_PERMIT" ? "SEM ALVARÁ" : item.permitStatus === "UNKNOWN" ? "Não verificado" : "Alvará informado"}<br />{item.locationType === "RURAL" ? "Rural" : "Urbana"}</td><td className="p-2">{item.status === "EMBARGOED" ? "Embargada" : "Em fiscalização"}<br />{item.process.status}</td><td className="p-2"><Link className="text-blue-700 underline" href={`/obras/construcao-civil/fiscalizacao/${item.id}`}>Detalhes</Link></td></tr>)}</tbody>
      </table>
      {!cases.length && <p className="p-4 text-xs text-slate-500">Nenhum processo fiscal disponível no seu setor para os filtros.</p>}
      <div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="processos fiscais" /></div>
    </section>
  </PageFrame>;
}
