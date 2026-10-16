"use client";

import { useState, useTransition } from "react";
import { bulkChangePgvAction } from "./actions";

type Patch = Parameters<typeof bulkChangePgvAction>[0]["patch"];
type Fields = NonNullable<Patch["fields"]>;
export default function PgvBulkClient(props: { filter: Parameters<typeof bulkChangePgvAction>[0]["filter"]; rows: { id: string; version: number; name: string; value: string | null; fields: Fields }[]; neighborhoods: { id: string; name: string }[]; streets: { id: string; name: string }[] }) {
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<Fields>(props.rows[0]?.fields ?? []);
  const [valueKey, setValueKey] = useState("");
  const valueField = fields.find(field => field.key === valueKey);
  const updateField = (index: number, patch: Partial<Fields[number]>) => setFields(current => current.map((field, position) => position === index ? { ...field, ...patch } : field));
  return <section className="space-y-3 rounded border bg-white p-3"><h2 className="font-semibold">Prévia: {props.rows.length} PGVs</h2>{notice && <p role="status">{notice}</p>}<ul className="max-h-56 overflow-auto text-xs">{props.rows.map(row => <li key={row.id}>{row.name} · v{row.version} · R$ {row.value}/m²</li>)}</ul>
    <form className="space-y-3" action={form => startTransition(async () => {
      const patch: Parameters<typeof bulkChangePgvAction>[0]["patch"] = {};
      if (form.get("changeValue") === "on") patch.landUnitValue = String(form.get("value") ?? "");
      if (form.get("changeStatus") === "on") patch.active = form.get("active") === "on";
      if (form.get("changeName") === "on") patch.name = String(form.get("name") ?? "");
      if (form.get("changeNeighborhood") === "on") patch.neighborhoodId = String(form.get("neighborhood") ?? "") || null;
      if (form.get("changeStreet") === "on") patch.streetId = String(form.get("street") ?? "") || null;
      if (form.get("changeFields") === "on") patch.fields = fields;
      if (form.get("changeCatalogValue") === "on") {
        if (!valueField) { setNotice("Selecione o campo adicional da PGV."); return; }
        const value = String(form.get("catalogValue") ?? "");
        patch.catalogValues = { [valueField.key]: valueField.type === "BOOLEAN" ? value === "" ? null : value === "true" : value };
      }
      const result = await bulkChangePgvAction({ filter: props.filter, expected: props.rows.map(row => ({ id: row.id, version: row.version })), patch, legalBasis: String(form.get("legalBasis") ?? "") });
      setNotice(result.error ?? `${result.count} PGVs alteradas com as versões anteriores preservadas.`);
    })}><label className="flex gap-2 text-xs"><input name="changeValue" type="checkbox"/>Alterar valor do m²<input name="value" type="number" min="0" step="0.000001" className="rounded border p-1"/></label><label className="flex gap-2 text-xs"><input name="changeStatus" type="checkbox"/>Alterar situação<input name="active" type="checkbox" defaultChecked/>Ativas (desmarque para desativar)</label>
      <label className="flex gap-2 text-xs"><input name="changeName" type="checkbox"/>Alterar nome<input name="name" maxLength={240} className="rounded border p-1"/></label>
      <fieldset className="space-y-2 rounded border p-2"><legend className="text-xs"><label><input name="changeCatalogValue" type="checkbox"/> Alterar valor de informação própria da PGV</label></legend><p className="text-xs">O campo deve existir na configuração de todas as PGVs selecionadas; os demais valores são preservados.</p><select aria-label="Campo da informação própria" value={valueKey} onChange={event => setValueKey(event.target.value)} className="rounded border p-2 text-xs"><option value="">Selecione</option>{fields.filter(field => field.key).map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select>
        {valueField?.type === "BOOLEAN" ? <select name="catalogValue" aria-label="Novo valor" className="rounded border p-2 text-xs"><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select> : valueField?.type === "LIST" ? <select name="catalogValue" aria-label="Novo valor" className="rounded border p-2 text-xs"><option value="">Não informado</option>{(valueField.options ?? []).map(option => <option key={option}>{option}</option>)}</select> : <input name="catalogValue" aria-label="Novo valor" type={valueField?.type === "NUMBER" ? "number" : valueField?.type === "DATE" ? "date" : "text"} step="any" className="rounded border p-2 text-xs"/>}
      </fieldset>
      {([["Neighborhood", "Bairro", props.neighborhoods], ["Street", "Logradouro", props.streets]] as const).map(([key, label, options]) => <label key={key} className="flex gap-2 text-xs"><input name={`change${key}`} type="checkbox"/>Alterar {label.toLowerCase()}<select name={key.toLowerCase()} className="rounded border p-1"><option value="">Selecione</option>{options.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>)}
      <fieldset className="space-y-2 rounded border p-3"><legend className="text-xs font-semibold"><label><input name="changeFields" type="checkbox" className="mr-2"/>Substituir a configuração dos campos adicionais de todas as PGVs selecionadas</label></legend><p className="text-xs">Estrutura inicial baseada na primeira PGV da prévia. As versões já utilizadas ficam preservadas.</p>{fields.map((field, index) => <div key={index} className="grid gap-2 rounded border p-2 text-xs sm:grid-cols-3"><label>Chave<input value={field.key} onChange={event => updateField(index, { key: event.target.value })} className="mt-1 w-full rounded border p-1"/></label><label>Descrição<input value={field.label} onChange={event => updateField(index, { label: event.target.value })} className="mt-1 w-full rounded border p-1"/></label><label>Tipo<select value={field.type} onChange={event => updateField(index, { type: event.target.value as Fields[number]["type"] })} className="mt-1 w-full rounded border p-1">{([["TEXT", "Texto"], ["NUMBER", "Número"], ["DATE", "Data"], ["BOOLEAN", "Sim / não"], ["LIST", "Lista"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><input type="checkbox" checked={field.required} onChange={event => updateField(index, { required: event.target.checked })} className="mr-2"/>Obrigatório</label>{field.type === "LIST" && <label>Opções (uma por linha)<textarea value={(field.options ?? []).join("\n")} onChange={event => updateField(index, { options: event.target.value.split("\n") })} className="mt-1 w-full rounded border p-1"/></label>}<button type="button" onClick={() => setFields(current => current.filter((_, position) => position !== index))} className="rounded border p-1">Remover campo</button></div>)}<button type="button" disabled={fields.length >= 100} onClick={() => setFields(current => [...current, { key: "", label: "", type: "TEXT", required: false, options: [] }])} className="rounded border p-2 text-xs">Adicionar campo</button></fieldset>
      <label className="block text-xs">Fundamento legal<textarea name="legalBasis" required className="mt-1 w-full rounded border p-2"/></label><button disabled={pending || !props.rows.length || props.rows.length > 500} className="rounded bg-emerald-700 p-2 text-xs text-white">Aplicar à seleção completa</button></form>
  </section>;
}
