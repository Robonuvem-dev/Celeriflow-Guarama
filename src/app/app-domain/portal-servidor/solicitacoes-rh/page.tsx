import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { HrRequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";
export default async function MyHrRequests({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const params = await searchParams;
  const status = ["EM_ANALISE", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status : undefined;
  const where = { employeeId: access.employee.id, kind: { not: "ACESSO_PORTAL" }, ...(status ? { status } : {}) };
  const total = await access.context.prisma.hrPortalRequest.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await access.context.prisma.hrPortalRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), status: status || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Minhas solicitações ao RH" description="Acompanhe a análise e a decisão dos seus pedidos." action={<Link href="/portal-servidor">Voltar</Link>} />
    <HrRequestForm requestKey={randomUUID()} />
    <Link href="/portal-servidor/credito" className="text-xs underline">Solicitar crédito consignado</Link>
    <Link href="/portal-servidor/recadastramento" className="text-xs underline">Campanhas de recadastramento</Link>
    <form className="flex gap-2 text-xs"><select name="status" defaultValue={status || ""} className="rounded border p-2"><option value="">Todas</option><option>EM_ANALISE</option><option>DEFERIDA</option><option>INDEFERIDA</option></select><button className="rounded border px-3">Filtrar</button></form>
    <p className="text-xs">{total} solicitações</p>
    {rows.map(row => <article key={row.id} className="rounded border bg-white p-3 text-xs"><strong>{row.kind} · {row.status}</strong><p className="whitespace-pre-wrap">{(row.payload as { description: string }).description}</p>{row.kind === "CREDITO_CONSIGNADO" && <pre className="whitespace-pre-wrap break-words">{JSON.stringify((row.payload as { input: unknown }).input, null, 2)}</pre>}{row.decision && <p className="mt-2 whitespace-pre-wrap">Decisão: {row.decision}</p>}<p className="text-slate-500">{row.id} · {row.createdAt.toISOString().slice(0, 10)}</p></article>)}
    <ErpPagination page={page} total={total} pageSize={20} label="solicitações" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
