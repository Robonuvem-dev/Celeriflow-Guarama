import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import type { PublicCollection, TransparencyQuery } from "@/lib/transparencia/query-contract";
import { publicQueryHref } from "@/lib/transparencia/query-contract";
import type { TransparencySettings } from "@/lib/transparencia/presentation-settings";
import { publicTransparencyPath } from "@/lib/transparencia/publication-policy";
import { SourceSelector } from "./SourceSelector";

export const transparencySourceLabels = { DOCUMENTOS: "Documentos municipais publicados", NATIVO: "Registros nativos Celeriflow", API_IBEMA: "API pública de Ibema — dados de referência", EXEMPLO: "Exemplos fictícios para apresentação" };
const field = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800";

export function ConsultationFilters({ query, collection, settings }: { query: TransparencyQuery; collection: PublicCollection; settings: TransparencySettings }) {
  const slug = collection.slug;
  const href = (next: TransparencyQuery) => `${publicTransparencyPath}?${publicQueryHref(next, { view: slug, page: 1 })}`;
  const chips = [
    ...(query.search ? [{ label: `Pesquisa: ${query.search}`, href: href({ ...query, search: "" }) }] : []),
    ...(query.from ? [{ label: `Desde: ${query.from}`, href: href({ ...query, from: undefined }) }] : []),
    ...(query.until ? [{ label: `Até: ${query.until}`, href: href({ ...query, until: undefined }) }] : []),
    ...Object.entries(query.filters).filter(([, value]) => value).map(([key, value]) => ({ label: `${collection.filters.find(item => item.key === key)?.label || key}: ${value}`, href: href({ ...query, filters: Object.fromEntries(Object.entries(query.filters).filter(([name]) => name !== key)) }) })),
  ];
  const advanced = Boolean(query.from || query.until || query.sort || Object.values(query.filters).some(Boolean));
  return <section aria-labelledby="consultation-filter-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <h3 id="consultation-filter-title" className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900"><Search aria-hidden="true" className="size-5 text-[#0e4c7e]" />Pesquisar nesta consulta</h3>
    <form key={publicQueryHref(query)} action={publicTransparencyPath} className="space-y-4 text-sm">
      <input type="hidden" name="view" value={slug} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
        <label className="font-semibold">Entidade<select name="entity" defaultValue={query.entity} className={field}>{settings.entities.filter(item => item.enabled).map(item => <option key={item.key} value={item.key}>{item.name}</option>)}<option value="consolidado">Prefeitura e Câmara — consolidado</option></select></label>
        <label className="font-semibold">Exercício<select name="year" defaultValue={query.year} className={field}>{settings.availableYears.map(year => <option key={year}>{year}</option>)}</select></label>
        <label className="font-semibold sm:col-span-2 xl:col-span-1">Pesquisar registros<input type="search" name="search" defaultValue={query.search} maxLength={200} placeholder="Digite um nome, número ou descrição" className={field} /></label>
      </div>
      <details open={advanced} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="min-h-6 cursor-pointer font-semibold text-[#0e4c7e]"><SlidersHorizontal aria-hidden="true" className="mr-2 inline size-4" />Filtros avançados e origem dos dados</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label>Fonte<SourceSelector source={query.source} options={transparencySourceLabels} /></label>
          <label>Data inicial<input type="date" name="from" defaultValue={query.from} className={field} /></label>
          <label>Data final<input type="date" name="until" defaultValue={query.until} className={field} /></label>
          <label>Ordenação<select name="sort" defaultValue={query.sort} className={field}><option value="">Padrão</option>{collection.columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
          <label>Sentido<select name="direction" defaultValue={query.direction} className={field}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
          <label>Registros por página<select name="pageSize" defaultValue={query.pageSize} className={field}>{[20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
          {collection.filters.map(filter => <label key={filter.key}>{filter.label}{filter.options ? <select name={`f.${filter.key}`} defaultValue={query.filters[filter.key] || ""} className={field}><option value="">Todos</option>{filter.options.map(option => <option key={option}>{option}</option>)}</select> : <input name={`f.${filter.key}`} defaultValue={query.filters[filter.key] || ""} maxLength={250} className={field} />}</label>)}
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3"><button className="min-h-11 rounded-lg bg-[#0e4c7e] px-5 py-2.5 font-bold text-white hover:bg-[#0a3a5c] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-sky-800">Consultar</button><Link href={href({ ...query, filters: {}, search: "", sort: "", direction: "asc", from: undefined, until: undefined })} className="inline-flex min-h-11 items-center rounded px-3 font-semibold text-[#0e4c7e] underline focus-visible:outline-3 focus-visible:outline-offset-2">Limpar filtros</Link></div>
    </form>
    {!!chips.length && <nav aria-label="Filtros ativos — selecione para remover" className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">{chips.map(chip => <Link key={chip.label} href={chip.href} className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 [overflow-wrap:anywhere] hover:bg-sky-100 focus-visible:outline-3 focus-visible:outline-offset-2"><span>{chip.label}</span><span aria-hidden="true">×</span><span className="sr-only"> — remover filtro</span></Link>)}</nav>}
  </section>;
}
