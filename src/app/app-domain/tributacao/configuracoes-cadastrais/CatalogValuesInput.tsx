"use client";

import type { z } from "zod";
import type { fiscalFieldSchema } from "@/lib/tributacao/configurable-cadastres";
import { FiscalValuesEditor } from "./FiscalValuesEditor";

export default function CatalogValuesInput({ fields, values }: { fields: z.infer<typeof fiscalFieldSchema>[]; values?: Record<string, string | boolean | null> }) {
  return <fieldset className="space-y-2 rounded border p-2"><legend className="text-xs font-semibold">Informações próprias do catálogo</legend>
    <label className="flex items-center gap-2 text-xs"><input name="useCatalogValues" type="checkbox" defaultChecked={values !== undefined}/>Gravar valores próprios nesta versão do zoneamento, PGV ou outro catálogo</label>
    <p className="text-xs">Exemplo: pavimentos e afastamentos do zoneamento; pavimentação e coleta da PGV. Os campos e seus tipos são os configurados acima.</p>
    <FiscalValuesEditor id="catalogo-valores-rascunho" title="Informações próprias do catálogo" fields={fields.filter(field => field.key)} values={values} prefix="catalog." nullableBoolean enforceRequired={false} />
  </fieldset>;
}
