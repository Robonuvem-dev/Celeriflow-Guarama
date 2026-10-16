"use client";
import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveRestriction } from "./actions";
type Employee = { id: string; name: string; roleId: string | null };
export function RestrictionForm({ employees, units, roles, attributes }: { employees: Employee[]; units: { id: string; name: string }[]; roles: { id: string; person: { fullName: string }; council: string }[]; attributes: { id: string; roleId: string; description: string }[] }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const duties = attributes.filter(a => a.roleId === employees.find(e => e.id === employeeId)?.roleId);
  return <SstForm redirectBase="/sst/restricoes" action={async f => { f.set("attributes", JSON.stringify(duties.map(a => ({ attributeId: a.id, allowed: f.get(`allowed:${a.id}`) === "ALLOW", note: String(f.get(`note:${a.id}`) || "") })))); return saveRestriction(f); }}>
    <label>UG<select name="budgetUnitId" className="block border p-2">{units.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
    <label>Servidor<select name="employeeId" value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="block border p-2">{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <label>Médico habilitado<select name="professionalRoleId" className="block border p-2">{roles.map(r => <option key={r.id} value={r.id}>{r.person.fullName} — {r.council}</option>)}</select></label>
    <label>Início<input name="startsAt" type="datetime-local" required className="block border p-2" /></label><label>Fim<input name="endsAt" type="datetime-local" required className="block border p-2" /></label>
    {[["type","Tipo"],["reason","Motivo"],["degree","Grau"],["cidCodes","CIDs (separar por ;)"]].map(([name,label]) => <label key={name}>{label}<input className="block w-full border p-2" name={name} required /></label>)}
    <h3 className="font-semibold">Atribuições do cargo</h3>{!duties.length && <p>Cadastre as atribuições canônicas do cargo antes de registrar a restrição.</p>}{duties.map(a => <fieldset key={a.id} className="border p-2"><legend>{a.description}</legend><select required name={`allowed:${a.id}`}><option value="">Escolha</option><option value="ALLOW">Liberada</option><option value="DENY">Impedida</option></select><input className="ml-2 border p-1" name={`note:${a.id}`} placeholder="Observação da atribuição" /></fieldset>)}
    <label><input name="notificationEnabled" type="checkbox" /> Agendar aviso de vencimento</label><label>Dias de antecedência<input name="notifyDays" type="number" min={0} max={365} defaultValue={7} /></label>
    <label>Responsável pelo aviso<select name="responsibleEmployeeId"><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><p>O aviso será enfileirado. Entrega depende de provedor de e-mail configurado e execução do serviço.</p>
  </SstForm>;
}
