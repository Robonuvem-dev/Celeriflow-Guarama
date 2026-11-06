"use client";

import { useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { fleetMovementAction } from "./actions";

export function FleetMovementPanel({ units, labels, requestId }: {
  units: { id: string; code: string; plate: string | null; name: string }[];
  labels: Record<string, string>;
  requestId: string;
}) {
  const [draft, setDraft] = useState({ operation: "plate", unitId: "", externalPlate: "", reading: "", recordId: "", reason: "" });
  const [file, setFile] = useState<File | null>(null);
  const field = (name: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [name]: value }));
  return <OperationalTablePanel title="Registrar movimento" triggerLabel="Registrar movimento ou importar arquivo">
    <form action={async form => { if (file) form.set("file", file); await fleetMovementAction(form); }} className="cf-portal-form grid gap-3 p-4 md:grid-cols-2">
      <input type="hidden" name="requestId" value={requestId} />
      <label>Operação<select required name="operation" value={draft.operation} onChange={event => field("operation", event.target.value)} className="block w-full rounded-lg border border-slate-300 p-2">{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Veículo (vínculo de placa ou troca do marcador)<select name="unitId" value={draft.unitId} onChange={event => field("unitId", event.target.value)} className="block w-full rounded-lg border border-slate-300 p-2"><option value="">Selecione</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {unit.plate} · {unit.name}</option>)}</select></label>
      <label>Placa externa / Vale Card<input name="externalPlate" maxLength={20} value={draft.externalPlate} onChange={event => field("externalPlate", event.target.value)} className="block w-full rounded-lg border border-slate-300 p-2" /></label>
      <label>Leitura inicial do novo hodômetro/horímetro<input name="reading" inputMode="decimal" value={draft.reading} onChange={event => field("reading", event.target.value)} className="block w-full rounded-lg border border-slate-300 p-2" /></label>
      <label>ID do consumo ou da ordem de manutenção a estornar<input name="recordId" maxLength={100} value={draft.recordId} onChange={event => field("recordId", event.target.value)} className="block w-full rounded-lg border border-slate-300 p-2" /></label>
      <label>Arquivo CSV (até 200 linhas e 500 KB)<input key={file ? `${file.name}:${file.lastModified}` : "none"} ref={node => { if (node && file) { const transfer = new DataTransfer(); transfer.items.add(file); node.files = transfer.files; } }} name="file" type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] ?? null)} className="block w-full rounded-lg border border-slate-300 p-2" />{file && <span className="text-xs">Arquivo selecionado: {file.name} <button type="button" onClick={() => setFile(null)}>Remover arquivo</button></span>}</label>
      <label className="md:col-span-2">Motivo / origem do arquivo<textarea required minLength={5} maxLength={2000} name="reason" value={draft.reason} onChange={event => field("reason", event.target.value)} className="block w-full rounded-lg border border-slate-300 p-2" /></label>
      <p className="text-xs text-slate-600 md:col-span-2">CSV separado por ponto e vírgula. Abastecimentos: placa;referencia;data;descricao;quantidade;valor. Manutenções: placa;referencia;data;descricao;valor. Datas AAAA-MM-DD; valores totais e quantidades com ponto decimal. A referência identifica a transação da operadora; repetições idênticas não duplicam o lançamento.</p>
      <p className="text-xs text-slate-600 md:col-span-2">Estornos preservam a origem e registram os valores inversos na data do lançamento. A troca do marcador conserva a leitura anterior no histórico e exige que não haja viagem aberta.</p>
      <div><button className="cf-portal-btn">Confirmar operação</button></div>
    </form>
  </OperationalTablePanel>;
}
