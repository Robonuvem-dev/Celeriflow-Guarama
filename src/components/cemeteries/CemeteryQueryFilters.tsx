import CemeteryLookup from "./CemeteryLookup";
import type { CemeteryQuery } from "@/lib/cemeteries/query-policy";

export function CemeteryQueryFilters({ query, report = false }: { query: CemeteryQuery; report?: boolean }) {
  return <form method="get" className="grid gap-3 rounded border p-4 md:grid-cols-3">
    <label className="grid gap-1 text-sm">Buscar falecido / comprovante<input className="rounded border p-2" name="q" defaultValue={query.q} /></label>
    <CemeteryLookup name="cemetery" kind="cemetery" label="Cemitério" defaultValue={query.cemetery} />
    <CemeteryLookup name="funeralHome" kind="funeralHome" label="Funerária" defaultValue={query.funeralHome} />
    {!report && <>
      <label className="grid gap-1 text-sm">Tipo<select className="rounded border p-2" name="type" defaultValue={query.type}><option value="">Todos</option><option>SEPULTAMENTO</option><option>VELORIO</option><option>CREMACAO</option></select></label>
      <label className="grid gap-1 text-sm">Situação<select className="rounded border p-2" name="status" defaultValue={query.status}><option value="">Todas</option>{["AGENDADO", "EM_REALIZACAO", "SEPULTADO", "CREMADO", "DESAPROPRIADO", "EXUMADO", "TRANSFERIDO", "CANCELADO", "ENCERRADO"].map(s => <option key={s}>{s}</option>)}</select></label>
      <CemeteryLookup name="cause" kind="cause" label="Causa da morte" defaultValue={query.cause} />
      <CemeteryLookup name="deceased" kind="deceased" label="Falecido" defaultValue={query.deceased} />
      <label className="grid gap-1 text-sm">Óbito desde<input className="rounded border p-2" type="date" name="deathStart" defaultValue={query.deathStart} /></label>
      <label className="grid gap-1 text-sm">Óbito até<input className="rounded border p-2" type="date" name="deathEnd" defaultValue={query.deathEnd} /></label>
    </>}
    <label className="grid gap-1 text-sm">Sepultamento efetivo desde<input className="rounded border p-2" type="date" name="start" defaultValue={query.start} /></label>
    <label className="grid gap-1 text-sm">Sepultamento efetivo até<input className="rounded border p-2" type="date" name="end" defaultValue={query.end} /></label>
    <button className="self-end rounded bg-emerald-700 p-2 text-white">Filtrar</button>
  </form>;
}
