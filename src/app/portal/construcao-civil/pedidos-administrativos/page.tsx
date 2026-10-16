import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { constructionRequestKinds } from "@/lib/obras/construction-request-policy";
import ConstructionExternalRequestAttendance from "@/components/construction/ConstructionExternalRequestAttendance";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function ConstructionExternalRequestQueue({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.some((role) => ["MANAGER", "ANALYST"].includes(role))) throw new Error("Atendimento reservado ao setor urbanístico.");
  // Scope through central processes, never through untrusted external request IDs.
  const where = { status: "PENDING", case: { is: constructionCaseWhere(access) } };
  const total = await context.prisma.constructionServiceRequest.count({ where });
  const query = await searchParams;
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const items = await context.prisma.constructionServiceRequest.findMany({ where, include: { case: { select: { process: { select: { protocolNumber: true } } } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><Link href="/obras/construcao-civil" className="text-blue-700 underline">Construção Civil</Link><h1 className="text-xl font-semibold">Atendimento de pedidos externos</h1>{!items.length && <p>Nenhum pedido pendente nos casos do seu escopo.</p>}{items.map((item) => <article key={item.id} className="space-y-3 rounded border p-3"><h2 className="font-semibold">{constructionRequestKinds[item.kind as keyof typeof constructionRequestKinds]} — <Link className="text-blue-700 underline" href={`/obras/construcao-civil/${item.caseId}`}>{item.case.process.protocolNumber}</Link></h2><p className="text-xs">Pedido {item.id} — {item.createdAt.toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap text-sm">{item.notes}</p>{["RENEWAL", "DOCUMENT_CORRECTION"].includes(item.kind) && <p className="break-all text-xs">Pedido documental: {String((item.payload as { documentRequestId?: string }).documentRequestId || "")}</p>}<ConstructionExternalRequestAttendance id={item.id} kind={item.kind} /></article>)}<ErpPagination page={page} total={total} pageSize={20} previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} label="pedidos pendentes" /></main>;
}
