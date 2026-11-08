"use client";
import type { GedBootstrap } from "@/lib/contracts/ged";
import type { GedQuery } from "@/lib/documents/ged-policy";
export function GedSearchFields({ bootstrap, query, onChange }: { bootstrap: GedBootstrap; query: GedQuery; onChange: (query: GedQuery) => void }) {
  const fields = [...new Map(bootstrap.classes.filter(c => !query.classCode || c.code === query.classCode).flatMap(c => c.fields ?? []).map(field => [field.key, field])).values()];
  const fieldClass = "h-9 w-full min-w-0 rounded border bg-background px-2 font-normal";
  return <fieldset className="grid min-w-0 gap-3">
    <legend className="mb-2 font-semibold">Setor e índices documentais</legend>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1 sm:col-span-2">Setor<select className={fieldClass} value={query.departmentId} onChange={e => onChange({ ...query, departmentId: e.target.value })}><option value="">Todos os setores autorizados</option>{bootstrap.departments?.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      {fields.map(field => <label className="grid min-w-0 gap-1" key={field.key}>Índice: {field.label}<input className={fieldClass} type={field.type === "date" ? "date" : "text"} placeholder={field.type === "boolean" ? "true ou false" : "Correspondência exata, sem distinção de acentos"} value={query.metadata[field.key] ?? ""} onChange={e => { const metadata = { ...query.metadata }; if (e.target.value) metadata[field.key] = e.target.value; else delete metadata[field.key]; onChange({ ...query, metadata }); }} /></label>)}
    </div>
  </fieldset>;
}
