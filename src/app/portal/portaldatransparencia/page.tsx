import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { parseTransparencyQuery, publicQueryHref } from "@/lib/transparencia/query-contract";
import { displayPublicCell as display } from "@/lib/transparencia/display";
import { publishedTransparencyCatalog, runTransparencyConsultation } from "@/lib/transparencia/consultation-service";
import { publicTransparencyPath } from "@/lib/transparencia/publication-policy";
import { ConsultationMenu } from "@/components/transparencia/ConsultationMenu";
import { PublicNotice } from "@/components/transparencia/PublicNotice";
import { AccessCounter } from "@/components/transparencia/AccessCounter";
import { ConsultationFilters, transparencySourceLabels } from "@/components/transparencia/ConsultationFilters";
import { PageFeedbackForm } from "@/components/transparencia/PageFeedbackForm";
import { applyDiscoverySettings, getDiscoverySettings, publicPortalOrigin } from "@/lib/transparencia/discovery-settings";
import { TransparencyHome } from "@/components/transparencia/TransparencyHome";
import { buildTransparencyDiscovery, isTransparencyConsultation } from "@/lib/transparencia/discovery";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const [raw, presentation] = await Promise.all([searchParams, getDiscoverySettings(prisma)]);
  return { title: `${presentation.title} | ${MUNICIPALITY_INSTITUTION_NAME}`, description: presentation.intro, alternates: { canonical: `${publicPortalOrigin(presentation)}${publicTransparencyPath}` }, ...(isTransparencyConsultation(raw) ? { robots: { index: false, follow: true } } : {}) };
}
const sources = transparencySourceLabels;
export default async function PublicTransparencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const [settings, presentation] = await Promise.all([getTransparencySettings(prisma), getDiscoverySettings(prisma)]);
  const catalog = publishedTransparencyCatalog(settings);
  if (!isTransparencyConsultation(raw)) {
    const now = new Date().toISOString();
    const entity = settings.entities.find(item => item.enabled)!.key;
    const popupActive = settings.popup.enabled && settings.popup.entities.includes(entity) && (!settings.popup.startsAt || settings.popup.startsAt <= now) && (!settings.popup.endsAt || settings.popup.endsAt >= now);
    return <>
      {popupActive && <PublicNotice title={settings.popup.title} text={settings.popup.text} imageUrl={settings.popup.imageUrl} frequency={settings.popup.frequency} noticeKey={`${settings.popup.title}:${settings.popup.text}:${settings.popup.startsAt || ""}`} />}
      <TransparencyHome sections={applyDiscoverySettings(buildTransparencyDiscovery(catalog, settings), presentation)} presentation={presentation} />
    </>;
  }
  const slug = typeof raw.view === "string" ? raw.view : "publicacoes";
  let collection = catalog.find(collection => collection.slug === slug);
  const params = new URLSearchParams(Object.entries(raw).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  if (!params.has("entity")) params.set("entity", settings.entities.find(item => item.enabled)!.key);
  if (!params.has("year")) params.set("year", String(settings.availableYears.includes(new Date().getUTCFullYear())?new Date().getUTCFullYear():settings.availableYears[0]));
  if (!params.has("source")) params.set("source", slug === "publicacoes"||slug.startsWith("doc-") ? "DOCUMENTOS" : settings.defaultSource);
  const parsed = (() => { try { return parseTransparencyQuery(params); } catch { return null; } })();
  if (!parsed || !collection) return <main className="mx-auto max-w-7xl p-6"><h1 className="text-2xl font-bold">Portal da Transparência</h1><p className="my-4">Consulta ou filtros não disponíveis.</p><Link href={publicTransparencyPath} className="underline">Voltar ao início da transparência</Link></main>;
  const query = parsed;
  let result: Awaited<ReturnType<typeof runTransparencyConsultation>> | null = null;
  try { result = await runTransparencyConsultation(prisma, slug, query, settings); } catch { /* Falha de origem não equivale a conjunto vazio. */ }
  collection=result?.collection||collection;
  const href = (extra: Record<string, string | number | undefined> = {}) => `${publicTransparencyPath}?${publicQueryHref(query, { view: slug, ...extra })}`;
  const selected = typeof raw.record === "string" ? result?.rows.find(record => record.key === raw.record) : null;
  const menu=catalog.map(item=>({slug:item.slug,title:item.title,group:item.group,href:`${publicTransparencyPath}?${publicQueryHref({ ...query, filters: {}, search: "", sort: "", from: undefined, until: undefined }, { view: item.slug, page: 1, source: item.slug === "publicacoes" || item.slug.startsWith("doc-") ? "DOCUMENTOS" : query.source })}`}));
  const now=new Date().toISOString(),popupActive=settings.popup.enabled&&settings.popup.entities.includes(query.entity)&&(!settings.popup.startsAt||settings.popup.startsAt<=now)&&(!settings.popup.endsAt||settings.popup.endsAt>=now);
  const documentGroups=query.source==="DOCUMENTOS"&&result?.status==="AVAILABLE"?await prisma.transparencyPublication.groupBy({by:["group"],where:{status:"PUBLISHED",year:query.year,entity:{in:settings.entities.filter(entity=>entity.enabled&&(query.entity==="consolidado"||entity.key===query.entity)).map(entity=>entity.key)},collectionSlug:slug!=="publicacoes"?slug:{in:catalog.map(collection=>collection.slug)}},orderBy:{group:"asc"}}):[];
  return <main id="consulta-transparencia" className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-900 sm:px-6">
    <AccessCounter enabled={settings.countAccess} slug={slug} query={publicQueryHref(query)}/>
    <nav aria-label="Caminho percorrido" className="flex flex-wrap gap-2 text-sm"><Link className="underline" href="/portal">Portal institucional</Link><span aria-hidden="true">/</span><Link className="underline" href="/portal/portaldatransparencia">Transparência</Link><span aria-hidden="true">/</span><span aria-current="page">{collection.title}</span></nav>
    <nav className="flex flex-wrap gap-4 text-sm" aria-label="Governança e mapa"><Link className="underline" href="/portal/portaldatransparencia/mapa">Mapa das consultas</Link><Link className="underline" href="/portal/portaldatransparencia/pntp">PNTP e evidências</Link><Link className="underline" href="/portal/portaldatransparencia/estatisticas">Estatísticas e satisfação</Link><Link className="underline" href="/portal/portaldatransparencia?view=legislacao&source=NATIVO">Diário Oficial e legislação</Link></nav>
    {popupActive&&<PublicNotice key={`${settings.popup.title}:${settings.popup.startsAt||""}`} title={settings.popup.title} text={settings.popup.text} imageUrl={settings.popup.imageUrl} frequency={settings.popup.frequency} noticeKey={`${settings.popup.title}:${settings.popup.text}:${settings.popup.startsAt||""}`}/>}
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="min-w-0"><p className="text-sm text-slate-600">Informação pública · consulta sem cadastro</p><h1 className="mt-2 text-2xl font-bold [overflow-wrap:anywhere]">{collection.title}</h1><p className="mt-2 text-sm">{query.entity === "consolidado" ? "Prefeitura e Câmara — consolidado" : settings.entities.find(entity => entity.key === query.entity)?.name} · Exercício {query.year}</p></div><nav aria-label="Serviços de informação" className="flex flex-wrap gap-4 text-sm font-semibold text-[#0e4c7e]"><Link href={publicTransparencyPath} className="underline">Todos os assuntos</Link><Link href="/portal/acesso-informacao">e-SIC</Link><Link href="/portal/ouvidoria">Ouvidoria</Link></nav></header>
    <nav aria-label="Visões de transparência" className="flex flex-wrap gap-4 text-sm font-bold"><Link href={`${publicTransparencyPath}/painel?${publicQueryHref(query)}`} className="underline">Painel financeiro</Link><Link href={`${publicTransparencyPath}?${publicQueryHref({...query,filters:{},sort:"",search:""},{view:"publicacoes",source:"DOCUMENTOS"})}`} className="underline">Biblioteca documental</Link><Link href={`${publicTransparencyPath}?${publicQueryHref({...query,filters:{},sort:"",search:""},{view:slug,source:"EXEMPLO"})}`} className="underline">Testar esta consulta com exemplos fictícios</Link></nav>
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <ConsultationMenu items={menu} current={slug}/>
      <section className="min-w-0 space-y-4" aria-labelledby="consultation-results-title"><div><h2 id="consultation-results-title" className="text-xl font-bold">Consulta e resultados</h2><p className="text-sm leading-6 text-slate-600">{settings.queries[slug]?.hint || collection.description}</p></div>
        {!!documentGroups.length&&<details open className="rounded border p-3"><summary className="cursor-pointer font-bold">Biblioteca por assunto · {query.year}</summary><ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">{documentGroups.map(item=><li key={item.group}><Link className="underline" href={`${publicTransparencyPath}?${publicQueryHref({...query,filters:{group:item.group},search:"",sort:""},{view:slug,source:"DOCUMENTOS",page:1})}`}>{item.group}</Link></li>)}</ul></details>}
        <ConsultationFilters query={query} collection={collection} settings={settings} />
        <aside className={`rounded border p-3 text-sm ${query.source === "EXEMPLO" ? "border-amber-300 bg-amber-50" : "bg-slate-50"}`}><strong>Fonte: {sources[query.source]}</strong><p>{result?.provenance || "Não foi possível confirmar esta fonte. Tente novamente mais tarde."}</p>{result?.updatedAt && <p>Referência/coleta: {display(result.updatedAt, "date")}</p>}{settings.openingHours && <p>Atendimento: {settings.openingHours}</p>}</aside>
        <a className="inline-block text-sm underline" href={`/api/transparencia/consultas/${slug}?${publicQueryHref(query,{format:"schema"})}`}>Dicionário de campos, filtros e formatos</a>
        {result?.declarationLinks?.map(link=><a key={link.url} href={link.url} className="block text-sm font-semibold underline">Declaração: {link.title}</a>)}
        {!result || result.status !== "AVAILABLE" ? <p role="status" className="rounded border p-4">{result?.message || "Consulta indisponível. Não há total ou arquivo confirmado para esta fonte."}</p> : <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"><p role="status" className="py-2 font-semibold">{result.total} registro(s) no conjunto filtrado</p>{result.complete && <details className="max-w-full rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-bold text-[#0e4c7e]">Baixar dados</summary><p className="mt-3 max-w-md text-sm leading-6 text-slate-600">O arquivo inclui todo o conjunto filtrado, não apenas esta página. A fonte e os filtros acompanham a exportação.</p><nav aria-label="Exportar conjunto completo" className="mt-3 flex flex-wrap gap-3">{["csv","pdf","xlsx","txt","docx","json","jpeg"].map(format=><a key={format} className="inline-flex min-h-10 items-center rounded border border-slate-300 px-3 py-2 font-semibold text-[#0e4c7e] underline" href={`/api/transparencia/consultas/${slug}?${publicQueryHref(query, { format })}`}>{format==="jpeg"?"JPEG (ZIP)":format.toUpperCase()}</a>)}</nav></details>}</div>
          <div id="resultados-consulta" className="scroll-mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Tabela de resultados">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{collection.title} — {sources[query.source]}, exercício {query.year}</caption>
              <thead className="bg-slate-100"><tr>
                {query.entity === "consolidado" && <th scope="col" className="p-3">Entidade</th>}
                {collection.columns.map(column => <th key={column.key} scope="col" aria-sort={query.sort === column.key ? query.direction === "asc" ? "ascending" : "descending" : "none"} className="p-3"><Link className="rounded focus-visible:outline-3 focus-visible:outline-offset-2" href={href({ sort: column.key, direction: query.sort === column.key && query.direction === "asc" ? "desc" : "asc", page: 1 })}>{column.label} <span aria-hidden="true">↕</span></Link></th>)}
                <th scope="col" className="p-3">Acesso</th>
              </tr></thead>
              <tbody>{result.records.map(record => <tr key={record.key} className="border-t align-top hover:bg-slate-50">
                {query.entity === "consolidado" && <td className="p-3">{record.entity}</td>}
                {collection.columns.map(column => <td key={column.key} className="max-w-md p-3">{display(record.values[column.key], column.kind)}</td>)}
                <td className="space-y-2 p-3"><Link className="block rounded underline focus-visible:outline-3 focus-visible:outline-offset-2" href={`${href({ record: record.key, page: result.page })}#detalhes-registro`}>Detalhes<span className="sr-only"> do registro {record.key}</span></Link>{record.links?.map(link => <a key={link.url} className="block rounded underline focus-visible:outline-3 focus-visible:outline-offset-2" href={link.url}>{link.title}{/^https?:\/\//i.test(link.url) && " — site externo ↗"}</a>)}</td>
              </tr>)}{!result.total && <tr><td colSpan={collection.columns.length + (query.entity === "consolidado" ? 2 : 1)} className="p-6">Nenhum registro publicado para os filtros selecionados.</td></tr>}</tbody>
            </table>
          </div>
          {!!collection.amountFields.length && <dl className="flex flex-wrap gap-5 rounded border bg-slate-50 p-3 text-sm">{collection.amountFields.map(field => <div key={field}><dt>{collection.columns.find(column => column.key === field)?.label || field} — total filtrado</dt><dd className="font-bold">{result.totals[field] === null ? "Total não disponível: campos ausentes" : display(result.totals[field], "money")}</dd></div>)}</dl>}
          <nav aria-label="Paginação dos resultados" className="flex justify-between text-sm">{result.page > 1 ? <Link className="underline" href={href({ page: result.page - 1 })}>Anterior</Link> : <span /> }<span>Página {result.page} de {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>{result.page * result.pageSize < result.total ? <Link className="underline" href={href({ page: result.page + 1 })}>Próxima</Link> : <span />}</nav>
        </>}
        {selected && <section id="detalhes-registro" tabIndex={-1} aria-labelledby="record-details-title" className="scroll-mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 focus-visible:outline-3 focus-visible:outline-sky-800">
          <h3 id="record-details-title" className="text-lg font-bold">Detalhes do registro</h3>
          <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(selected.values).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-semibold text-slate-600">{collection.columns.find(column => column.key === key)?.label || key}</dt><dd className="mt-1 text-sm [overflow-wrap:anywhere]">{display(value, collection.columns.find(column => column.key === key)?.kind)}</dd></div>)}</dl>
          {selected.events?.map((event, index) => <p key={index} className="text-sm">{event.stage} · {event.number} · {display(event.date, "date")} · {display(event.value, "money")} · {event.status}</p>)}
          {selected.items?.map((item, index) => <p key={index} className="text-sm">{item.description} · {item.quantity} × {display(item.unitPrice, "money")} = {display(item.total, "money")}</p>)}
          <Link href={`${href({ page: result?.page || query.page })}#resultados-consulta`} className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-bold text-[#0e4c7e] underline focus-visible:outline-3 focus-visible:outline-offset-2">Voltar à lista de resultados</Link>
        </section>}
      </section>
    </div>
    {presentation.feedbackEnabled && <PageFeedbackForm key={slug} page="CONSULTATION" collectionSlug={slug} />}
  </main>;
}
