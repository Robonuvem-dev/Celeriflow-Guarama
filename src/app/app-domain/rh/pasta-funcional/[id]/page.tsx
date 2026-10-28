import Link from "next/link";
import { db } from "@/db/client";
import { readFolderEmployee, readFolderPage } from "@/db/repositories/personnel-pages/folder";
import { canViewModule, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function FunctionalFolderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"), user = context.user, database = context.database ?? db; const { id } = await params; const filters = await searchParams;
  const employee = await readFolderEmployee(database, id);
  const tab = ["contratos", "atos", "documentos", "ocorrencias", "direitos"].includes(filters.tab || "") ? filters.tab! : "contratos";
  const q = (filters.q || "").trim(); const documentsAllowed = canViewModule(user, "DOCUMENTOS") && Boolean(employee.personId);
  const { total, page, contracts, acts, documents, occurrences, cancellations, rights } = await readFolderPage(database, { id, personId: employee.personId, tab, q, page: filters.page, documentsAllowed });
  const canceled = new Set(cancellations.map(row => row.sourceKey));
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
