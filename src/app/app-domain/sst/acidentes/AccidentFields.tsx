"use client";
import { useState } from "react";
export function AccidentFields({ portal = false, units = [], employees = [] }: { portal?: boolean; units?: { id: string; name: string }[]; employees?: { id: string; name: string; registration: string | null }[] }) {
  const [witnesses, setWitnesses] = useState<{ name: string; contact: string; statement: string }[]>([]);
  const [kind, setKind] = useState("TYPICAL");
  return <>
    {!portal && <label>Unidade gestora<select className="block w-full rounded border p-2" name="budgetUnitId" required><option value="">Selecione</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
    {!portal && <label>Servidor<select className="block w-full rounded border p-2" name="employeeId" required><option value="">Selecione após buscar pelo nome</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.registration}</option>)}</select></label>}
    <label>Data e hora da ocorrência<input className="block rounded border p-2" type="datetime-local" name="occurredAt" required /></label>
    <label>Tipo<select className="block rounded border p-2" name="kind" value={kind} onChange={e => setKind(e.target.value)}><option value="TYPICAL">Típico</option><option value="COMMUTE">Trajeto</option><option value="DISEASE">Doença ocupacional</option>{!portal && <option value="INCIDENT">Incidente sem CAT</option>}</select></label>
    <label>Situação geradora<select className="block rounded border p-2" name="generatingStatus"><option value="INITIAL">Inicial</option><option value="REOPENING">Reabertura</option><option value="DEATH">Óbito</option></select></label>
    {[['location','Local'],['agent','Agente causador'],['bodyParts','Partes atingidas (separar por ;)'],['description','Descrição'],['statement','Depoimento do servidor']].map(([name,label]) => <label key={name}>{label}<textarea className="block w-full rounded border p-2" name={name} required={kind !== "INCIDENT" || ["location","description"].includes(name)} maxLength={10000} /></label>)}
    {kind === "INCIDENT" && <label>Análise das causas<textarea name="causeAnalysis" className="block w-full rounded border p-2" required minLength={10} maxLength={10000} /></label>}
    <h3 className="font-semibold">Testemunhas</h3><input type="hidden" name="witnesses" value={JSON.stringify(witnesses)} />
    {witnesses.map((w,i) => <fieldset key={i} className="rounded border p-2"><legend>Testemunha {i + 1}</legend>{(["name","contact","statement"] as const).map(key => <label className="block" key={key}>{key === "name" ? "Nome" : key === "contact" ? "Contato" : "Depoimento"}<input className="block w-full rounded border p-2" required={key === "name"} value={w[key]} onChange={e => setWitnesses(witnesses.map((item,index) => index === i ? { ...item, [key]: e.target.value } : item))} /></label>)}<button type="button" onClick={() => setWitnesses(witnesses.filter((_,index) => index !== i))}>Remover testemunha</button></fieldset>)}
    <button type="button" disabled={witnesses.length >= 30} className="w-fit rounded border p-2" onClick={() => setWitnesses([...witnesses, { name: "", contact: "", statement: "" }])}>Adicionar testemunha</button>
  </>;
}
