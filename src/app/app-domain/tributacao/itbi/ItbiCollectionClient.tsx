"use client";

import { useState, useTransition } from "react";
import { createItbiPropertyCollectionAction } from "./collection-actions";
import { TaxFormRowsEditor } from "../TaxFormRowsEditor";

export default function ItbiCollectionClient(props: { properties: { id: string; label: string; taxpayerId: string | null }[]; taxpayers: { id: string; name: string }[]; types: { id: string; name: string }[]; processes: { id: string; protocolNumber: string }[] }) {
  const [ids, setIds] = useState<string[]>([]); const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const field = "mt-1 w-full rounded border p-2 text-xs";
  return <details className="m-3 shrink-0 rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Incluir vários imóveis / unidades no mesmo processo</summary>{notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    <form action={form => startTransition(async () => {
      const text = (key: string) => String(form.get(key) ?? "");
      const result = await createItbiPropertyCollectionAction({ reason: text("reason"), declarations: ids.map(id => ({ realEstateId: id, transactionTypeId: text("type"), processId: text("process"), registryOffice: text("registryOffice"), transmittedFractionPercent: Number(form.get(`fraction.${id}`)), declaredPropertyValue: Number(form.get(`value.${id}`)), sellerTaxpayerId: text(`seller.${id}`), buyers: [{ taxpayerId: text("buyer"), sharePercent: 100 }], cadastralUpdateMode: "MANUAL" })) });
      setNotice(result.error ?? `${result.count} transmissões incluídas no mesmo processo.`);
    })} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs">Processo<select name="process" required className={field}><option value="">Selecione</option>{props.processes.map(row => <option key={row.id} value={row.id}>{row.protocolNumber}</option>)}</select></label>
      <label className="text-xs">Modalidade<select name="type" required className={field}><option value="">Selecione</option>{props.types.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="text-xs">Tabelionato<input name="registryOffice" required className={field} /></label>
      <label className="text-xs">Adquirente comum<select name="buyer" required className={field}><option value="">Selecione</option>{props.taxpayers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="text-xs sm:col-span-2">Imóveis / unidades (seleção múltipla)<select multiple value={ids} onChange={event => setIds(Array.from(event.target.selectedOptions, option => option.value))} className={`${field} min-h-32`}>{props.properties.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <div className="sm:col-span-2"><TaxFormRowsEditor id="itbi-conjunto-imoveis-rascunho" title="Imóveis do conjunto ITBI" rows={ids.map(id => ({ id, label: props.properties.find(row => row.id === id)?.label ?? id, initialValues: { seller: props.properties.find(row => row.id === id)?.taxpayerId ?? "", fraction: "100" } }))} fields={[{ key: "seller", label: "Transmitente", name: (_index, id) => `seller.${id}`, type: "select", required: true, minWidth: 120, initialWidth: 350, options: [{ value: "", label: "Selecione" }, ...props.taxpayers.map(row => ({ value: row.id, label: row.name }))] }, { key: "value", label: "Valor venal informado", name: (_index, id) => `value.${id}`, type: "number", required: true, min: 0.01, step: "0.01" }, { key: "fraction", label: "Fração transmitida (%)", name: (_index, id) => `fraction.${id}`, type: "number", required: true, min: 0.000001, max: 100, step: "0.000001" }]} /></div>
      <label className="text-xs sm:col-span-2">Fundamento<textarea name="reason" required className={field} /></label>
      <button disabled={pending || !ids.length} className="rounded bg-emerald-700 p-2 text-xs text-white">Incluir conjunto no processo</button>
    </form>
  </details>;
}
