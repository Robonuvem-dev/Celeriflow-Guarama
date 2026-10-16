import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { functionalRequestPayloadSchema } from "@/lib/portal-servidor/functional-requests";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function MyFunctionalProtocols({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams;
  const status = ["EM_ANALISE", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status : undefined;
  const where = { employeeId: access.employee.id, payload: { path: ["origin"], equals: "REQUERIMENTO_FUNCIONAL" }, ...(status ? { status } : {}) };
  const total = await access.context.prisma.hrPortalRequest.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const requests = await access.context.prisma.hrPortalRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
  const rows = requests.map(request => ({ request, payload: functionalRequestPayloadSchema.parse(request.payload) }));
  const processes = await access.context.prisma.process.findMany({ where: { id: { in: rows.map(row => row.payload.processId) } }, select: { id: true, protocolNumber: true, status: true, currentDepartment: { select: { name: true } }, expectedCompletionAt: true } });
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), status: status || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col p-3"><ErpPageTitle title="Meus protocolos funcionais" description="Acompanhe tramitação, pendências, decisão e execução dos seus requerimentos." action={<Link href="/portal-servidor/servicos">Solicitar serviço</Link>} />
    <ErpListFrame toolbar={<form className="flex gap-2 text-xs"><label htmlFor="functional-status" className="sr-only">Decisão</label><select id="functional-status" name="status" defaultValue={status || ""} className="h-8 rounded border border-slate-300 px-2"><option value="">Todas as decisões</option><option value="EM_ANALISE">Em análise</option><option value="DEFERIDA">Deferida</option><option value="INDEFERIDA">Indeferida</option></select><button className="rounded border px-3">Filtrar</button></form>} summary={<p className="text-xs">{total} protocolos</p>} pagination={<ErpPagination page={page} total={total} pageSize={20} label="protocolos" previousHref={href(page - 1)} nextHref={href(page + 1)} />}>
      <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Protocolo / serviço</th><th>Abertura</th><th>Tramitação / setor</th><th>Decisão</th><th>Execução / pendência</th></tr></thead><tbody>{rows.map(({ request, payload }) => { const process = processes.find(item => item.id === payload.processId); return <tr key={request.id} className="border-t border-slate-200"><td className="p-2"><Link href={`/portal-servidor/protocolos/${request.id}`} className="font-semibold text-emerald-800 underline">{process?.protocolNumber || "Protocolo indisponível"}</Link><p>{payload.serviceName}</p></td><td>{request.createdAt.toLocaleDateString("pt-BR")}</td><td>{process?.status}<p className="text-slate-500">{process?.currentDepartment?.name}</p></td><td>{request.status}</td><td>{payload.execution}{payload.awaitingComplement && <p className="font-semibold text-amber-700">Complementação solicitada</p>}</td></tr>; })}</tbody></table>
      {!total && <p className="p-4 text-sm">Nenhum protocolo funcional neste filtro. Pedidos anteriores continuam em <Link href="/portal-servidor/solicitacoes-rh" className="underline">Minhas solicitações ao RH</Link>.</p>}
    </ErpListFrame>
  </div>;
}
