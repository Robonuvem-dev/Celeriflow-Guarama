"use client";

import { useState } from "react";
import type { changePropertiesBulkAction } from "./actions";
import { TaxFormRowsEditor } from "../../TaxFormRowsEditor";

type Patch = Parameters<typeof changePropertiesBulkAction>[0]["profile"];
export type InscriptionSegment = { key: string; label: string; width: number; numeric: boolean };
export function readPropertyBulkProfileGroup(key: string, form: FormData, segments: InscriptionSegment[]): Patch {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  if (key === "coordinates") return { latitude: text("latitude") ? Number(text("latitude")) : null, longitude: text("longitude") ? Number(text("longitude")) : null };
  if (key === "correspondenceAddress") return { correspondenceAddress: { street: text("street"), number: text("addressNumber"), complement: text("addressComplement"), neighborhood: text("addressNeighborhood"), city: text("city"), state: text("state").toUpperCase(), zipCode: text("zipCode") } };
  if (key === "structure") return { kind: text("kind") as "Terreno" | "Unidade" | "Rural", parentId: text("parentId") || null, unitMode: text("unitMode") as "AUTONOMA" | "ENGLOBADA" || null };
  if (key === "inscriptionParts") return { inscriptionParts: Object.fromEntries(segments.map(segment => [segment.key, text(`segment.${segment.key}`)])) };
  if (key === "owners") return { owners: Array.from({ length: Number(text("ownerCount")) }, (_, index) => ({ taxpayerId: text(`owner.${index}`), sharePercent: text(`share.${index}`), primary: text("primaryOwner") === String(index) })) };
  throw new Error("Informação imobiliária não reconhecida.");
}

export default function PropertyBulkProfileInput({ name, segments }: { name: string; segments: InscriptionSegment[] }) {
  const [count, setCount] = useState(1); const field = "mt-1 w-full rounded border p-2 text-xs";
  const input = (key: string, label: string, type = "text", required = false) => <label className="text-xs">{label}<input name={key} type={type} required={required} step="any" maxLength={4000} className={field}/></label>;
  return <fieldset className="grid gap-3 rounded border p-3 sm:col-span-2 sm:grid-cols-3"><legend className="text-xs">Novos dados para os imóveis da seleção</legend>
    {name === "coordinates" && <>{input("latitude", "Latitude (vazio remove)", "number")}{input("longitude", "Longitude (vazio remove)", "number")}</>}
    {name === "correspondenceAddress" && <>{input("street", "Logradouro", "text", true)}{input("addressNumber", "Número")}{input("addressComplement", "Complemento")}{input("addressNeighborhood", "Bairro")}{input("city", "Município", "text", true)}{input("state", "UF", "text", true)}{input("zipCode", "CEP")}</>}
    {name === "structure" && <><label className="text-xs">Tipo<select name="kind" required className={field}>{["Terreno", "Unidade", "Rural"].map(value => <option key={value}>{value}</option>)}</select></label>{input("parentId", "Código do terreno principal (unidades)")}<label className="text-xs">Modalidade da unidade<select name="unitMode" className={field}><option value="">Não se aplica</option><option value="AUTONOMA">Autônoma</option><option value="ENGLOBADA">Englobada</option></select></label></>}
    {name === "inscriptionParts" && <><TaxFormRowsEditor id="alteracao-geral-inscricao-rascunho" title="Novos componentes da inscrição" rows={segments.map(segment => ({ id: segment.key, label: segment.label }))} fields={[{ key: "value", label: "Componente", name: (_index, id) => `segment.${id}`, required: true, maxLength: id => segments.find(segment => segment.key === id)?.width ?? 0, pattern: id => segments.find(segment => segment.key === id)?.numeric ? "[0-9]+" : "[a-zA-Z0-9]+", minWidth: 120, initialWidth: 500 }]} /><p className="text-xs sm:col-span-3">A composição é validada pela política municipal. Inscrições repetidas na seleção impedem a efetivação.</p></>}
    {name === "owners" && <div className="space-y-3 sm:col-span-3"><input type="hidden" name="ownerCount" value={count}/><TaxFormRowsEditor id="alteracao-geral-proprietarios-rascunho" title="Novos proprietários da seleção" rows={Array.from({ length: count }, (_, index) => ({ id: String(index), label: `Proprietário ${index + 1}`, initialValues: { primary: index === 0 } }))} fields={[{ key: "owner", label: "Código do contribuinte", name: index => `owner.${index}`, required: true, maxLength: 4000, minWidth: 100, initialWidth: 350 }, { key: "share", label: "Participação (%)", name: index => `share.${index}`, type: "number", required: true }, { key: "primary", label: "Titular principal", name: () => "primaryOwner", type: "radio", required: true }]} actions={<><button type="button" disabled={count >= 100} onClick={() => setCount(value => value + 1)}>Adicionar proprietário</button><button type="button" disabled={count <= 1} onClick={() => setCount(value => value - 1)}>Remover última linha</button></>} /></div>}
  </fieldset>;
}
