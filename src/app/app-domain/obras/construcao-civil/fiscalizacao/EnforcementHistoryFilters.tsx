type Props = { prefix: string; label: string; values: Record<string, string>; filters?: { name: string; label: string; options: { id: string; label: string }[] }[] };

export function EnforcementHistoryFilters({ prefix, label, values, filters = [] }: Props) {
  const ownKeys = new Set([`${prefix}Q`, `${prefix}Page`, ...filters.map((filter) => filter.name)]);
  return <form className="flex flex-wrap items-end gap-2">
    {Object.entries(values).filter(([key, value]) => value && !ownKeys.has(key)).map(([key, value]) => <input key={key} name={key} value={value} type="hidden" />)}
    <label className="min-w-48 flex-1 text-xs">Buscar {label}<input name={`${prefix}Q`} type="search" defaultValue={values[`${prefix}Q`]} className="mt-1 w-full rounded border bg-transparent p-2" /></label>
    {filters.map((filter) => <label key={filter.name} className="text-xs">{filter.label}<select name={filter.name} defaultValue={values[filter.name] || ""} className="mt-1 block rounded border bg-transparent p-2"><option value="">Todos</option>{filter.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}
    <button className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Filtrar</button>
  </form>;
}
