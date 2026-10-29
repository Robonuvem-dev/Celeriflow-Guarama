"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { publishValuationRuleAction, saveValuationAction } from "./actions";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Rule = { id: string; taxId: string; version: number; data: Record<string, unknown> };
const inputClass = "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs";
const buttonClass = "rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50";

export default function ValuationClient(props: { taxes: { id: string; name: string }[]; rules: Rule[]; properties: { id: string; label: string; landArea: number | null; builtArea: number | null }[]; valuations: { propertyId: string; year: number; updatedAt: string }[]; memories: { id: string; propertyId: string; category: string; date: string; version: number; data: Record<string, unknown> }[] }) {
  const [taxId, setTaxId] = useState(props.taxes[0]?.id ?? "");
  const [year, setYear] = useState(new Date().getFullYear());
  const [ruleId, setRuleId] = useState(props.rules[0]?.id ?? "");
  const [propertyId, setPropertyId] = useState(props.properties[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const editing = props.rules.find(rule => rule.taxId === taxId && rule.data.year === year);
  const selected = props.rules.find(rule => rule.id === ruleId);
  const property = props.properties.find(item => item.id === propertyId);
  function run(task: () => Promise<{ error?: string }>, success: string) { startTransition(async () => { const result = await task(); setMessage(result.error ?? success); }); }
  return <TaxOperationalTable id="avaliacoes"
    toolbar={<OperationalFilters label="Regras e avaliação">
    <p className="mt-1 text-xs text-slate-600">Regras independentes por tributo, UG e exercício. Cada publicação conserva a versão anterior e cada avaliação registra a memória do cálculo.</p>
    {message && <p role="status" className="my-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm">{message}</p>}
    <div className="my-4 grid gap-4 lg:grid-cols-2">
      <form action={form => run(() => publishValuationRuleAction({ taxId, year, expectedVersion: editing?.version ?? 0, landUnitValue: String(form.get("landUnitValue")), constructionUnitValue: String(form.get("constructionUnitValue")), landFactor: String(form.get("landFactor")), constructionFactor: String(form.get("constructionFactor")), globalFactor: String(form.get("globalFactor")), legalBasis: String(form.get("legalBasis")), reference: String(form.get("reference")), landSource: String(form.get("landSource")) as "RULE" | "PGV_FRONTAGES" }), "Regra publicada com histórico preservado.")} className="space-y-3 rounded border bg-white p-3">
        <h2 className="text-sm font-bold">Publicar regra de avaliação</h2>
        <label className="block text-xs">Origem do valor do terreno<select key={`${taxId}:${year}:${editing?.version ?? 0}:source`} name="landSource" defaultValue={String(editing?.data.landSource ?? "RULE")} className={inputClass}><option value="RULE">Valor unitário informado na regra</option><option value="PGV_FRONTAGES">PGVs vinculadas — média ponderada pelas testadas</option></select></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs">Tributo<select className={inputClass} value={taxId} onChange={event => setTaxId(event.target.value)}>{props.taxes.map(tax => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select></label><label className="text-xs">Exercício<input className={inputClass} type="number" min="1900" max="9999" value={year} onChange={event => setYear(Number(event.target.value))} /></label>
        {([["landUnitValue", "Valor por m² de terreno", "0"], ["constructionUnitValue", "Valor por m² construído", "0"], ["landFactor", "Fator do terreno", "1"], ["constructionFactor", "Fator da construção", "1"], ["globalFactor", "Fator global", "1"]] as const).map(([key, label, fallback]) => <label key={`${taxId}:${year}:${editing?.version ?? 0}:${key}`} className="text-xs">{label}<input name={key} className={inputClass} type="number" min="0" step="0.000001" required defaultValue={String(editing?.data[key] ?? fallback)} /></label>)}</div>
        <p className="text-xs text-slate-500">(Área do terreno × valor/m² × fator do terreno + área construída × valor/m² × fator da construção) × fator global</p>
        <label className="block text-xs">Fundamento<textarea key={`${taxId}:${year}:${editing?.version ?? 0}:basis`} name="legalBasis" required className={inputClass} defaultValue={String(editing?.data.legalBasis ?? "")} /></label><label className="block text-xs">Referência documental<input key={`${taxId}:${year}:${editing?.version ?? 0}:reference`} name="reference" required className={inputClass} defaultValue={String(editing?.data.reference ?? "")} /></label>
        <button disabled={pending || !taxId} className={buttonClass}>Publicar versão {(editing?.version ?? 0) + 1}</button>
      </form>
      <form action={form => run(() => saveValuationAction({ ruleId, realEstateId: propertyId, reason: String(form.get("reason")), expectedValuationUpdatedAt: props.valuations.find(item => item.propertyId === propertyId && item.year === selected?.data.year)?.updatedAt ?? null }), "Avaliação salva com memória e fundamento.")} className="space-y-3 rounded border bg-white p-3">
        <h2 className="text-sm font-bold">Avaliar imóvel pela regra publicada</h2>
        <label className="block text-xs">Regra<select className={inputClass} value={ruleId} onChange={event => setRuleId(event.target.value)}><option value="">Selecione</option>{props.rules.map(rule => <option key={rule.id} value={rule.id}>{props.taxes.find(tax => tax.id === rule.taxId)?.name ?? rule.taxId} · {String(rule.data.year)} · versão {rule.version}</option>)}</select></label>
        <label className="block text-xs">Imóvel<select className={inputClass} value={propertyId} onChange={event => setPropertyId(event.target.value)}>{props.properties.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <p className="text-xs">Área do terreno: {property?.landArea ?? "não informada"} m² · Área construída: {property?.builtArea ?? "não informada"} m²</p>
        <label className="block text-xs">Fundamento da avaliação<textarea name="reason" className={inputClass} required /></label>
        <p className="text-xs text-slate-600">IPTU atualiza a avaliação anual consumida pelos lotes. ITBI conserva avaliação própria. A avaliação não cria débito nem guia.</p>
        <button disabled={pending || !ruleId || !propertyId} className={buttonClass}>Calcular e salvar avaliação</button>
        <Link href="/tributacao/lotes-anuais" className="ml-3 text-xs text-emerald-700 underline">Lotes anuais</Link>
      </form>
    </div>
    </OperationalFilters>}
    columns={[["property", "Imóvel", 150, 220], ["tax", "Tributo", 75, 90], ["year", "Exercício", 75, 85], ["value", "Valor venal", 110, 140, "text", "right"], ["version", "Versão", 65, 75], ["date", "Data", 155, 180], ["reason", "Fundamento", 150, 240], ["actions", "Ficha", 85, 85, "actions"]]}
    rows={props.memories.map(memory => ({ id: memory.id, label: props.properties.find(item => item.id === memory.propertyId)?.label ?? memory.propertyId, values: { property: props.properties.find(item => item.id === memory.propertyId)?.label ?? memory.propertyId, tax: memory.category.endsWith("IPTU") ? "IPTU" : "ITBI", year: String(memory.data.year), value: `R$ ${String(memory.data.venalValue)}`, version: String(memory.version), date: new Date(memory.date).toLocaleString("pt-BR"), reason: String(memory.data.reason ?? "") }, actions: <Link className="text-emerald-700 underline" href={`/tributacao/imoveis/${memory.propertyId}`}>Abrir ficha</Link> }))} />;
}
