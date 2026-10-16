import Link from "next/link";
import { Prisma } from "@prisma/client";
import { canViewModule, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function FunctionalFolderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const { prisma, user } = await getTenantContextForModule("RH"); const { id } = await params; const filters = await searchParams;
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id }, include: { person: { select: { id: true, fullName: true } } } });
  const tab = ["contratos", "atos", "documentos", "ocorrencias", "direitos"].includes(filters.tab || "") ? filters.tab! : "contratos";
  const q = (filters.q || "").trim(); const documentsAllowed = canViewModule(user, "DOCUMENTOS") && Boolean(employee.personId);
  const contractWhere: Prisma.HrEmploymentContractWhereInput = { employeeId: id, ...(q ? { registration: { contains: q, mode: "insensitive" } } : {}) };
  const actWhere: Prisma.PersonnelActWhereInput = { employeeId: id, ...(q ? { OR: [{ type: { contains: q, mode: "insensitive" } }, { actNumber: { contains: q, mode: "insensitive" } }] } : {}) };
  const documentWhere: Prisma.DocumentWhereInput = { personId: employee.personId || "", healthClinicalDocument: { is: null }, healthStandardDocument: { is: null }, sstCertificateDocument: { is: null }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { documentType: { contains: q, mode: "insensitive" } }] } : {}) };
  const occurrenceWhere: Prisma.HrIntegrationEventWhereInput = { eventType: "OCORRENCIA_FUNCIONAL_REGISTRADA", payload: { path: ["employeeId"], equals: id }, ...(q ? { sourceKey: { contains: q, mode: "insensitive" } } : {}) };
  const rightWhere: Prisma.HrRightEntryWhereInput = { contract: { employeeId: id }, ...(q ? { kind: { contains: q, mode: "insensitive" } } : {}) };
  const total = tab === "contratos" ? await prisma.hrEmploymentContract.count({ where: contractWhere }) : tab === "atos" ? await prisma.personnelAct.count({ where: actWhere }) : tab === "documentos" ? documentsAllowed ? await prisma.document.count({ where: documentWhere }) : 0 : tab === "ocorrencias" ? await prisma.hrIntegrationEvent.count({ where: occurrenceWhere }) : await prisma.hrRightEntry.count({ where: rightWhere });
  const page = Math.min(Math.max(1, Number.parseInt(filters.page || "1") || 1), Math.max(1, Math.ceil(total / 20))); const paging = { skip: (page - 1) * 20, take: 20 };
  const contracts = tab === "contratos" ? await prisma.hrEmploymentContract.findMany({ where: contractWhere, ...paging, orderBy: [{ registration: "asc" }, { id: "asc" }] }) : [];
  const acts = tab === "atos" ? await prisma.personnelAct.findMany({ where: actWhere, ...paging, orderBy: [{ date: "desc" }, { id: "asc" }], select: { id: true, type: true, actNumber: true, date: true } }) : [];
  const documents = tab === "documentos" && documentsAllowed ? await prisma.document.findMany({ where: documentWhere, ...paging, orderBy: [{ title: "asc" }, { id: "asc" }], select: { id: true, title: true, documentType: true, status: true, validUntil: true } }) : [];
  const occurrences = tab === "ocorrencias" ? await prisma.hrIntegrationEvent.findMany({ where: occurrenceWhere, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }) : [];
  const cancellations = occurrences.length ? await prisma.hrIntegrationEvent.findMany({ where: { sourceKey: { in: occurrences.map(row => `OCORRENCIA:CANCELAMENTO:${row.id}`) } }, select: { sourceKey: true } }) : [];
  const canceled = new Set(cancellations.map(row => row.sourceKey));
  const rights = tab === "direitos" ? await prisma.hrRightEntry.findMany({ where: rightWhere, ...paging, include: { contract: { select: { registration: true } } }, orderBy: [{ periodStart: "desc" }, { id: "asc" }] }) : [];
  const href = (value: number) => `?${new URLSearchParams({ tab, q, page: String(value) })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Pasta funcional" description={`${employee.person?.fullName || employee.name} · ${employee.isActive ? "Ativo" : "Inativo"} · identidade funcional ${id}`} action={<Link href="/rh/operacoes">Operações RH</Link>} />
    <nav className="flex flex-wrap gap-2 text-xs">{["contratos", "atos", "documentos", "ocorrencias", "direitos"].map(value => <Link key={value} href={`?tab=${value}`} className={`rounded border px-3 py-2 ${value === tab ? "bg-blue-100" : "bg-white"}`}>{value}</Link>)}</nav>
    <form className="flex gap-2 text-xs"><input name="tab" type="hidden" value={tab} /><input name="q" defaultValue={q} placeholder="Buscar nesta seção" className="h-8 rounded border px-2" /><button className="rounded border px-3">Filtrar</button></form><p className="text-xs">{total} registros no filtro · página {page}. Os registros permanecem nas rotinas de origem.</p>
    {tab === "documentos" && <p className="rounded border p-2 text-xs">{documentsAllowed ? "Documentos cadastrais da pessoa central. Documentos clínicos e atestados permanecem nas rotinas de Saúde/SST, com suas permissões próprias." : "Consulta de documentos exige vínculo central e permissão de acesso ao GED."}</p>}
    {contracts.map(row => <section key={row.id} className="rounded border bg-white p-3 text-xs">{row.registration} · {row.workLocation} · nível {row.salaryLevel || "não informado"} · v{row.version} · <Link className="underline" href={`/rh/operacoes/contratos/${row.id}`}>Revisões e memória contratual</Link> · <Link className="underline" href={`/rh/ocorrencias?contractId=${row.id}`}>Ocorrências do contrato</Link></section>)}
    {acts.map(row => <section key={row.id} className="rounded border bg-white p-3 text-xs">{row.date.toISOString().slice(0, 10)} · {row.type} · {row.actNumber || "sem número"} · <Link className="underline" href={`/rh/atos/${row.id}/editar`}>Consultar ato</Link></section>)}
    {documents.map(row => <section key={row.id} className="rounded border bg-white p-3 text-xs">{row.title} · {row.documentType} · {row.status} · validade {row.validUntil?.toISOString().slice(0, 10) || "não definida"} · ID {row.id} · <Link className="underline" href="/documentos/ged">Consultar no GED</Link></section>)}
    {occurrences.map(row => { const payload = row.payload as { input: { type: string; date: string; reason: string; contractId: string } }; return <section key={row.id} className="rounded border bg-white p-3 text-xs">{payload.input.date} · {payload.input.type} · {row.environment} · {canceled.has(`OCORRENCIA:CANCELAMENTO:${row.id}`) ? "Cancelada" : "Registrada"} · {payload.input.reason} · <Link className="underline" href={`/rh/ocorrencias?contractId=${payload.input.contractId}`}>Consultar histórico</Link></section>; })}
    {rights.map(row => <section key={row.id} className="rounded border bg-white p-3 text-xs">{row.contract.registration} · {row.kind} · {row.periodStart.toISOString().slice(0, 10)} a {row.periodEnd.toISOString().slice(0, 10)} · quantidade assinada {row.quantity.toString()} · R$ {row.amount.toFixed(2)} · {row.sourceKey}</section>)}
    {!total && <p className="text-sm">Nenhum registro nesta seção/filtro.</p>}
    <ErpPagination page={page} total={total} pageSize={20} label="registros" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
