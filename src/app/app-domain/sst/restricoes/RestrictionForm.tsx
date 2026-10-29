"use client";
import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveRestriction } from "./actions";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
type Employee = { id: string; name: string; roleId: string | null };
export function RestrictionForm({ employees, units, roles, attributes }: { employees: Employee[]; units: { id: string; name: string }[]; roles: { id: string; person: { fullName: string }; council: string }[]; attributes: { id: string; roleId: string; description: string }[] }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const duties = attributes.filter(a => a.roleId === employees.find(e => e.id === employeeId)?.roleId);
  const [decisions, setDecisions] = useState<Record<string, { allowed: string; note: string }>>({});
  const [selectedId, setSelectedId] = useState("");
  const duty = duties.find(item => item.id === selectedId) || duties[0];
  const update = (id: string, patch: Partial<{ allowed: string; note: string }>) => setDecisions(current => ({ ...current, [id]: { ...(current[id] ?? { allowed: "", note: "" }), ...patch } }));
  return <SstForm redirectBase="/sst/restricoes" action={async f => { if (duties.some(item => !decisions[item.id]?.allowed)) return { error: "Informe liberação ou impedimento de todas as atribuições, inclusive de outras páginas." }; f.set("attributes", JSON.stringify(duties.map(item => ({ attributeId: item.id, allowed: decisions[item.id]?.allowed === "ALLOW", note: decisions[item.id]?.note || "" })))); return saveRestriction(f); }}>
    <label>UG<select name="budgetUnitId" className="block border p-2">{units.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
    <label>Servidor<select name="employeeId" value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="block border p-2">{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <label>Médico habilitado<select name="professionalRoleId" className="block border p-2">{roles.map(r => <option key={r.id} value={r.id}>{r.person.fullName} — {r.council}</option>)}</select></label>
    <label>Início<input name="startsAt" type="datetime-local" required className="block border p-2" /></label><label>Fim<input name="endsAt" type="datetime-local" required className="block border p-2" /></label>
    {[["type","Tipo"],["reason","Motivo"],["degree","Grau"],["cidCodes","CIDs (separar por ;)"]].map(([name,label]) => <label key={name}>{label}<input className="block w-full border p-2" name={name} required /></label>)}
    <h3 className="font-semibold">Atribuições do cargo</h3>{!duties.length && <p>Cadastre as atribuições canônicas do cargo antes de registrar a restrição.</p>}
    <SstTablePanel title="Atribuições e restrições" preferenceId="sst-restricao-atribuicoes-edicao" columns={[sstColumn("description", "Atribuição", 400, 180), sstColumn("allowed", "Situação", 180, 100), sstColumn("note", "Observação", 350, 160), sstColumn("actions", "Editar", 75, 65, "actions")]} rows={duties.map(item => ({ id: item.id, label: item.description, values: { description: item.description, allowed: decisions[item.id]?.allowed === "ALLOW" ? "Liberada" : decisions[item.id]?.allowed === "DENY" ? "Impedida" : "Escolha", note: decisions[item.id]?.note || "" }, actions: <button type="button" onClick={() => setSelectedId(item.id)}>Editar</button> }))} />
    {duty && <fieldset className="space-y-2 border p-2"><legend>{duty.description}</legend><select aria-label="Liberação da atribuição" value={decisions[duty.id]?.allowed || ""} onChange={event => update(duty.id, { allowed: event.target.value })}><option value="">Escolha</option><option value="ALLOW">Liberada</option><option value="DENY">Impedida</option></select><input aria-label="Observação da atribuição" className="ml-2 border p-1" value={decisions[duty.id]?.note || ""} onChange={event => update(duty.id, { note: event.target.value })} /></fieldset>}
    <label><input name="notificationEnabled" type="checkbox" /> Agendar aviso de vencimento</label><label>Dias de antecedência<input name="notifyDays" type="number" min={0} max={365} defaultValue={7} /></label>
    <label>Responsável pelo aviso<select name="responsibleEmployeeId"><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><p>O aviso será enfileirado. Entrega depende de provedor de e-mail configurado e execução do serviço.</p>
  </SstForm>;
}
