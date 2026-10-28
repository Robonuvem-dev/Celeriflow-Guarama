import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { loadPageExtractions, pageCaseProtocol } from "@/db/repositories/works-pages/cases";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import ConstructionExtractionClient from "./ConstructionExtractionClient";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; engine?: string; status?: string; page?: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const database = context.database ?? db;
  const item = await pageCaseProtocol(database, access, id);
  if (!item) notFound();
  const query = await searchParams;
  const q = (query.q || "").trim().slice(0, 100);
  const engine = query.engine === "DEMO_RULES" || query.engine === "OPENAI_COMPATIBLE" ? query.engine : "all";
  const status = query.status === "EXTRACTED" || query.status === "UNIDENTIFIABLE" ? query.status : "all";
  const { total, page, rows } = await loadPageExtractions(database, id, { q, engine, status, page: query.page });
  const href = (target: number) => `?${new URLSearchParams({ q, engine, status, page: String(target) })}`;
  return <PageFrame className="space-y-4 p-4">
    <Link href={`/obras/construcao-civil/${id}`} className="text-sm underline">Voltar ao processo</Link>
    <h1 className="text-xl font-semibold">Extração de pranchas — {item.process.protocolNumber}</h1>
    <p className="text-sm">Texto extraído de PDF real. O adaptador padrão é demonstrativo determinístico, identificado em cada resultado. PDF digitalizado depende de serviço OCR configurado. A comparação auxilia a análise e não concede aprovação.</p>
    <ConstructionExtractionClient caseId={id} canExtract={access.administrator || access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))} />
    <form className="flex flex-wrap gap-2 rounded border p-3">
      <input name="q" aria-label="Buscar arquivo, hash ou modelo" placeholder="Arquivo, hash ou modelo" defaultValue={q} className="min-w-0 flex-1 rounded border p-2 text-sm" />
      <select name="engine" aria-label="Provedor de extração" defaultValue={engine} className="rounded border p-2 text-sm"><option value="all">Todos os provedores</option><option value="DEMO_RULES">Demonstrativo determinístico</option><option value="OPENAI_COMPATIBLE">IA configurada</option></select>
      <select name="status" aria-label="Resultado da extração" defaultValue={status} className="rounded border p-2 text-sm"><option value="all">Todos os resultados</option><option value="EXTRACTED">Parâmetros extraídos</option><option value="UNIDENTIFIABLE">Não identificável</option></select>
      <button className="rounded border px-3 text-sm">Filtrar histórico</button><Link href={`/obras/construcao-civil/${id}/pranchas`} className="self-center text-sm underline">Limpar</Link>
    </form>
    <div className="space-y-4">{rows.map((row) => <section key={row.id} className="rounded border p-4 space-y-2"><h2 className="break-words font-semibold">{row.filename} — {row.status}</h2><p className="text-sm">{row.engine} / {row.model} · {row.createdAt.toLocaleString("pt-BR")}</p><p className="break-all text-xs">SHA-256: {row.sourceHash}</p><a className="text-sm underline" href={`/api/construcao-civil/pranchas/${row.id}`}>Baixar PDF de origem verificado</a><details><summary className="font-semibold">Parâmetros, página, evidência e confiança</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.measurements, null, 2)}</pre></details><details><summary className="font-semibold">Comparativo com versão do zoneamento</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.comparison, null, 2)}</pre></details><details><summary className="font-semibold">Limitações</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.limitations, null, 2)}</pre></details><details><summary>Texto extraído por página</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.pages, null, 2)}</pre></details></section>)}</div>
    {!rows.length && <p className="text-sm">Nenhuma extração corresponde aos filtros.</p>}
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="extrações" jumpTo={{ pathname: `/obras/construcao-civil/${id}/pranchas`, values: { q, engine, status } }} />
  </PageFrame>;
}
