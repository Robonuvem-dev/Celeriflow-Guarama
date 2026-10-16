import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/platform/tenant-context";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function ConstructionPortalPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const identity = await getConstructionPortalIdentity().catch((error) => { if (error instanceof AccessError && error.status === 401) redirect("/portal/construcao-civil/entrar"); throw error; });
  const query = await searchParams; const q = (query.q || "").trim().slice(0, 100);
  const where = { AND: [constructionPortalCaseWhere(identity.id), ...(q ? [{ process: { protocolNumber: { contains: q, mode: "insensitive" as const } } }] : [])] };
  const total = await prisma.constructionCase.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const items = await prisma.constructionCase.findMany({ where, select: { id: true, category: true, reviewStatus: true, process: { select: { protocolNumber: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
  const href = (target: number) => `?${new URLSearchParams({ q, page: String(target) })}`;
  const openingLink = <Link href="/portal/construcao-civil/nova" className="inline-block rounded bg-blue-600 px-3 py-2 text-sm text-white">Abrir solicitação autorizada</Link>;
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><h1 className="text-xl font-semibold">Construção Civil — Área profissional</h1><p className="text-sm">{identity.professional.person.fullName}</p>{openingLink}<form className="flex gap-2"><input name="q" aria-label="Buscar protocolo" defaultValue={q} placeholder="Buscar protocolo" className="min-w-0 flex-1 rounded border p-2 text-sm" /><button className="rounded bg-blue-600 px-3 text-sm text-white">Buscar</button></form><table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Protocolo</th><th className="p-2">Categoria</th><th className="p-2">Análise</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="p-2"><Link className="text-blue-700 underline" href={`/portal/construcao-civil/${item.id}`}>{item.process.protocolNumber}</Link></td><td className="p-2">{item.category === "BUILDING" ? "Obra" : "Parcelamento"}</td><td className="break-words p-2">{item.reviewStatus}</td></tr>)}</tbody></table>{!total && <p className="text-sm">Nenhuma solicitação vinculada à sua conta.</p>}<ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="solicitações" /></main>;
}
