import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { lifecycleListHref, type LifecycleListQuery } from "@/lib/obras/construction-lifecycle-list";

type Filter = { key: string; label: string; options?: { value: string; label: string }[] };
export function ConstructionLifecycleFilters({ query, pageKey, filters }: { query: LifecycleListQuery; pageKey: string; filters: Filter[] }) {
  const owned = new Set([pageKey, ...filters.map((filter) => filter.key)]);
  return <form method="get" className="flex flex-wrap items-end gap-3 rounded border p-3">{Object.entries(query).filter(([key, value]) => value && !owned.has(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}{filters.map((filter) => <label key={filter.key} className="text-sm">{filter.label}{filter.options ? <select className="block rounded border bg-transparent p-2" name={filter.key} defaultValue={query[filter.key] || ""}><option value="">Todos</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input className="block rounded border bg-transparent p-2" name={filter.key} defaultValue={query[filter.key] || ""} maxLength={160} />}</label>)}<button className="rounded border px-3 py-2">Buscar / filtrar</button></form>;
}
export function ConstructionLifecyclePagination({ query, pageKey, page, total, label }: { query: LifecycleListQuery; pageKey: string; page: number; total: number; label: string }) {
  return <ErpPagination page={page} total={total} pageSize={20} previousHref={lifecycleListHref(query, pageKey, page - 1)} nextHref={lifecycleListHref(query, pageKey, page + 1)} label={label} />;
}
