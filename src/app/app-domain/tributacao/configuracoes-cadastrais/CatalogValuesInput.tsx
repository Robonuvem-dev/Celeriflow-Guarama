"use client";

import type { z } from "zod";
import type { fiscalFieldSchema } from "@/lib/tributacao/configurable-cadastres";

export default function CatalogValuesInput({ fields, values }: { fields: z.infer<typeof fiscalFieldSchema>[]; values?: Record<string, string | boolean | null> }) {
  return <fieldset className="space-y-2 rounded border p-2"><legend className="text-xs font-semibold">Informações próprias do catálogo</legend>
    <label className="flex items-center gap-2 text-xs"><input name="useCatalogValues" type="checkbox" defaultChecked={values !== undefined}/>Gravar valores próprios nesta versão do zoneamento, PGV ou outro catálogo</label>
    <p className="text-xs">Exemplo: pavimentos e afastamentos do zoneamento; pavimentação e coleta da PGV. Os campos e seus tipos são os configurados acima.</p>
    {fields.filter(field => field.key).map(field => <label key={field.key} className="block text-xs">{field.label}
      {field.type === "BOOLEAN" ? <select name={`catalog.${field.key}`} defaultValue={typeof values?.[field.key] === "boolean" ? String(values[field.key]) : ""} className="mt-1 w-full rounded border p-2"><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select>
        : field.type === "LIST" ? <select name={`catalog.${field.key}`} defaultValue={String(values?.[field.key] ?? "")} className="mt-1 w-full rounded border p-2"><option value="">Não informado</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
          : <input name={`catalog.${field.key}`} type={field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : "text"} step={field.type === "NUMBER" ? "any" : undefined} defaultValue={String(values?.[field.key] ?? "")} className="mt-1 w-full rounded border p-2"/>}
    </label>)}
  </fieldset>;
}
