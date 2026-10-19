import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { pageFeedbackRetentionDays } from "@/lib/transparencia/page-feedback";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = { HOME: "Página inicial", SEARCH: "Pesquisa", CONSULTATION: "Consulta" };
export default async function PageFeedbackManagement({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getTenantContextForModule("TRANSPARENCIA");
  const raw = await searchParams;
  const selectedPage = ["HOME", "SEARCH", "CONSULTATION"].includes(raw.page || "") ? raw.page : undefined;
  const requested = Number(raw.p);
  const page = Number.isInteger(requested) && requested >= 1 && requested <= 100000 ? requested : 1;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - pageFeedbackRetentionDays);
  const where = { createdAt: { gte: since }, ...(selectedPage ? { page: selectedPage } : {}) };
  const [summary, rows, total] = await Promise.all([
    context.prisma.transparencyPageFeedback.groupBy({ by: ["rating"], where, _count: true, orderBy: { rating: "asc" } }),
    context.prisma.transparencyPageFeedback.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 30, take: 30, select: { id: true, page: true, collectionSlug: true, rating: true, comment: true, createdAt: true } }),
    context.prisma.transparencyPageFeedback.count({ where }),
  ]);
  return <main className="mx-auto max-w-6xl space-y-5 p-5"><Link href="/transparencia" className="underline">← Gestão</Link><h1 className="text-2xl font-bold">Avaliações de usabilidade das páginas</h1><p className="text-sm text-slate-600">Comentários restritos à equipe autorizada. Retenção de até 365 dias, com limpeza automática no recebimento de avaliações. Não são manifestações de Ouvidoria nem avaliações de atendimento.</p><form className="flex flex-wrap gap-3"><label>Tipo de página<select name="page" defaultValue={selectedPage || ""} className="ml-2 rounded border p-2"><option value="">Todas</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="rounded border px-4 py-2">Filtrar</button></form><section className="rounded-xl border bg-white p-5"><h2 className="font-bold">{total} avaliação(ões)</h2><dl className="mt-3 flex flex-wrap gap-5">{summary.map(item => <div key={item.rating}><dt>Nota {item.rating}</dt><dd className="font-bold">{item._count}</dd></div>)}</dl></section><section className="space-y-3"><h2 className="font-bold">Comentários e contexto</h2>{rows.map(row => <article key={row.id} className="rounded-lg border bg-white p-4"><p className="font-semibold">{labels[row.page]}{row.collectionSlug ? ` · ${row.collectionSlug}` : ""} · Nota {row.rating}</p><p className="mt-1 text-xs text-slate-600">{row.createdAt.toLocaleString("pt-BR")}</p><p className="mt-3 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{row.comment || "Sem comentário."}</p></article>)}{!rows.length && <p>Nenhuma avaliação registrada para este filtro.</p>}</section><nav aria-label="Paginação das avaliações" className="flex flex-wrap gap-4 text-sm">{page > 1 && <Link href={`?p=${page - 1}&page=${selectedPage || ""}`} className="underline">Anterior</Link>}<span>Página {page}</span>{page * 30 < total && <Link href={`?p=${page + 1}&page=${selectedPage || ""}`} className="underline">Próxima</Link>}</nav></main>;
}
