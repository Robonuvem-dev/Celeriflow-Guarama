import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { db } from "@/db/client";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { publishedTransparencyCatalog } from "@/lib/transparencia/consultation-service";
import { buildTransparencyDiscovery, searchTransparencyDiscovery } from "@/lib/transparencia/discovery";
import { applyDiscoverySettings, getDiscoverySettings } from "@/lib/transparencia/discovery-settings";
import { documentSearchSchema, searchPublishedDocuments } from "@/lib/transparencia/document-search";
import { publicTransparencyPath } from "@/lib/transparencia/publication-policy";
import { TransparencySearchForm } from "@/components/transparencia/TransparencyHome";
import { TransparencyCard, TransparencyHelp } from "@/components/transparencia/TransparencyCard";
import { PageFeedbackForm } from "@/components/transparencia/PageFeedbackForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesquisa | Portal da Transparência", description: "Encontre assuntos, serviços e documentos publicados no Portal da Transparência.", robots: { index: false, follow: true } };
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800";

export default async function TransparencySearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = typeof raw.q === "string" ? raw.q.trim().slice(0, 200) : "";
  const [settings, presentation] = await Promise.all([getTransparencySettings(db), getDiscoverySettings(db)]);
  const catalog = publishedTransparencyCatalog(settings);
  const sections = applyDiscoverySettings(buildTransparencyDiscovery(catalog, settings), presentation);
  const results = searchTransparencyDiscovery(sections, query);
  const parsed = documentSearchSchema.safeParse({ q: query, ...Object.fromEntries(["year", "entity", "collection", "page"].flatMap(key => raw[key] !== undefined ? [[key, raw[key]]] : [])) });
  let documents: Awaited<ReturnType<typeof searchPublishedDocuments>> | null = null;
  let documentError = "";
  if (parsed.success) {
    try { documents = await searchPublishedDocuments(db, settings, parsed.data); }
    catch { documentError = "Não foi possível consultar os documentos com esses filtros. Revise a seleção ou tente novamente."; }
  } else documentError = "Os filtros informados não são válidos. Selecione um exercício, entidade e assunto disponíveis.";
  const documentHref = (page: number) => `${publicTransparencyPath}/pesquisa?${new URLSearchParams({ q: query, year: parsed.success ? parsed.data.year : "", entity: parsed.success ? parsed.data.entity : "", collection: parsed.success ? parsed.data.collection : "", page: String(page) })}#documentos-publicados`;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <nav aria-label="Caminho percorrido" className="flex flex-wrap gap-2 text-sm text-slate-600"><Link href={publicTransparencyPath} className="rounded underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Transparência</Link><span aria-hidden="true">/</span><span aria-current="page">Pesquisa</span></nav>
    <header className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-8"><h1 className="mb-6 text-3xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere]">Pesquisar informações públicas</h1><TransparencySearchForm query={query} /></header>
    <section aria-labelledby="search-results-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 id="search-results-title" className="mb-5 text-xl font-bold text-slate-900 [overflow-wrap:anywhere]">{query ? `Assuntos e serviços — ${results.length} resultado(s) para “${query}”` : "Assuntos e serviços"}</h2>
      {results.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.map(({ item, section }) => <TransparencyCard key={item.id} item={item} tone={section.tone} sectionTitle={section.title} />)}</div> : <div className="py-5 text-center"><Search className="mx-auto mb-3 size-8 text-slate-500" aria-hidden="true" /><p className="font-semibold text-slate-800">{query ? "Nenhum assunto encontrado com esses termos." : "Digite um assunto para localizar um serviço ou uma consulta."}</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Tente receitas, contratos, salários ou medicamentos. Os documentos publicados aparecem na seção abaixo.</p><Link href={publicTransparencyPath} className="mt-4 inline-flex min-h-11 items-center rounded px-3 font-semibold text-[#0e4c7e] underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800">Ver todos os assuntos</Link></div>}
    </section>
    <section id="documentos-publicados" aria-labelledby="document-results-title" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 id="document-results-title" className="text-xl font-bold text-slate-900">Documentos publicados{documents ? ` — ${documents.total} resultado(s)` : ""}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Pesquisa por título, assunto, categoria e competência dos documentos. Não inclui o conteúdo integral dos arquivos PDF.</p>
      <form className="my-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="q" value={query} />
        <label>Exercício<select name="year" defaultValue={parsed.success ? parsed.data.year : ""} className={field}><option value="">Todos os publicados</option>{settings.availableYears.map(year => <option key={year}>{year}</option>)}</select></label>
        <label>Entidade<select name="entity" defaultValue={parsed.success ? parsed.data.entity : ""} className={field}><option value="">Todas as disponíveis</option>{settings.entities.filter(item => item.enabled).map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <label>Assunto<select name="collection" defaultValue={parsed.success ? parsed.data.collection : ""} className={field}><option value="">Todos os assuntos</option>{catalog.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select></label>
        <button className="mt-auto min-h-11 rounded-lg bg-[#0e4c7e] px-4 py-2.5 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-sky-800">Filtrar documentos</button>
      </form>
      {documentError ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{documentError}</p> : documents && <>
        <div className="space-y-3">{documents.records.map(document => <article key={document.publicKey} className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <p className="mb-2 text-xs font-semibold text-slate-600">{document.group} · {document.year} · {settings.entities.find(item => item.key === document.entity)?.name}</p>
          <h3 className="flex items-start gap-2 text-base font-bold text-slate-900 [overflow-wrap:anywhere]"><FileText className="mt-0.5 size-5 shrink-0 text-[#0e4c7e]" aria-hidden="true" />{document.title}</h3>
          <p className="mt-2 text-sm text-slate-600">Competência: {document.referencePeriod}{document.publishedAt ? ` · Publicado em ${document.publishedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}</p>
          {document.hasFile ? <a href={`/api/transparencia/publicacoes/${document.publicKey}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-sky-200 px-3 py-2 text-sm font-bold text-[#0e4c7e] underline focus-visible:outline-3 focus-visible:outline-offset-2">Acessar documento</a> : document.linkUrl && /^https?:\/\//i.test(document.linkUrl) ? <a href={document.linkUrl} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-sky-200 px-3 py-2 text-sm font-bold text-[#0e4c7e] underline focus-visible:outline-3 focus-visible:outline-offset-2">Acessar publicação de origem — site externo ↗</a> : <p className="mt-3 text-sm text-slate-600">Arquivo não disponível para acesso.</p>}
        </article>)}</div>
        {!documents.total && <p role="status" className="rounded-lg bg-slate-50 p-5 text-sm text-slate-700">Nenhum documento publicado para os termos e filtros selecionados.</p>}
        <nav aria-label="Paginação dos documentos" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">{documents.page > 1 ? <Link href={documentHref(documents.page - 1)} className="rounded px-3 py-2 font-semibold text-[#0e4c7e] underline">Anterior</Link> : <span />}<span>Página {documents.page} de {documents.pages}</span>{documents.page < documents.pages ? <Link href={documentHref(documents.page + 1)} className="rounded px-3 py-2 font-semibold text-[#0e4c7e] underline">Próxima</Link> : <span />}</nav>
      </>}
    </section>
    <TransparencyHelp />
    {presentation.feedbackEnabled && <PageFeedbackForm page="SEARCH" />}
  </main>;
}
