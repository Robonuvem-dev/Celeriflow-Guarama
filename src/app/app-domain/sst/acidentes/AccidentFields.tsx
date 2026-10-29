"use client";
import { useState } from "react";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
export function AccidentFields({ portal = false, units = [], employees = [] }: { portal?: boolean; units?: { id: string; name: string }[]; employees?: { id: string; name: string; registration: string | null }[] }) {
  const [witnesses, setWitnesses] = useState<{ name: string; contact: string; statement: string }[]>([]);
  const [kind, setKind] = useState("TYPICAL");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const index = Math.min(selectedIndex, witnesses.length - 1), witness = witnesses[index];
  return <>
    {!portal && <label>Unidade gestora<select className="block w-full rounded border p-2" name="budgetUnitId" required><option value="">Selecione</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
    {!portal && <label>Servidor<select className="block w-full rounded border p-2" name="employeeId" required><option value="">Selecione após buscar pelo nome</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name} · {e.registration}</option>)}</select></label>}
    <label>Data e hora da ocorrência<input className="block rounded border p-2" type="datetime-local" name="occurredAt" required /></label>
    <label>Tipo<select className="block rounded border p-2" name="kind" value={kind} onChange={e => setKind(e.target.value)}><option value="TYPICAL">Típico</option><option value="COMMUTE">Trajeto</option><option value="DISEASE">Doença ocupacional</option>{!portal && <option value="INCIDENT">Incidente sem CAT</option>}</select></label>
    <label>Situação geradora<select className="block rounded border p-2" name="generatingStatus"><option value="INITIAL">Inicial</option><option value="REOPENING">Reabertura</option><option value="DEATH">Óbito</option></select></label>
    {[['location','Local'],['agent','Agente causador'],['bodyParts','Partes atingidas (separar por ;)'],['description','Descrição'],['statement','Depoimento do servidor']].map(([name,label]) => <label key={name}>{label}<textarea className="block w-full rounded border p-2" name={name} required={kind !== "INCIDENT" || ["location","description"].includes(name)} maxLength={10000} /></label>)}
    {kind === "INCIDENT" && <label>Análise das causas<textarea name="causeAnalysis" className="block w-full rounded border p-2" required minLength={10} maxLength={10000} /></label>}
    <h3 className="font-semibold">Testemunhas</h3><input type="hidden" name="witnesses" value={JSON.stringify(witnesses)} />
    <SstTablePanel title="Testemunhas da ocorrência" preferenceId="sst-acidente-testemunhas-edicao" description="O payload de testemunhas contém a coleção completa. A paginação não altera o rascunho." columns={[sstColumn("name", "Nome", 260, 140), sstColumn("contact", "Contato", 220, 110), sstColumn("statement", "Depoimento", 400, 180), sstColumn("actions", "Ações", 145, 135, "actions")]} rows={witnesses.map((item, position) => ({ id: String(position), label: item.name || `Testemunha ${position + 1}`, values: { name: item.name, contact: item.contact, statement: item.statement }, actions: <><button type="button" onClick={() => setSelectedIndex(position)}>Editar</button> <button type="button" onClick={() => setWitnesses(current => current.filter((_, i) => i !== position))}>Remover</button></> }))} />
    {witness && <fieldset className="rounded border p-2"><legend>Testemunha {index + 1}</legend>{(["name", "contact", "statement"] as const).map(key => <label className="block" key={key}>{key === "name" ? "Nome" : key === "contact" ? "Contato" : "Depoimento"}<input className="block w-full rounded border p-2" required={key === "name"} value={witness[key]} onChange={event => setWitnesses(current => current.map((item, position) => position === index ? { ...item, [key]: event.target.value } : item))} /></label>)}<button type="button" onClick={() => setWitnesses(current => current.filter((_, i) => i !== index))}>Remover testemunha</button></fieldset>}
    <button type="button" disabled={witnesses.length >= 30} className="w-fit rounded border p-2" onClick={() => setWitnesses([...witnesses, { name: "", contact: "", statement: "" }])}>Adicionar testemunha</button>
  </>;
}
