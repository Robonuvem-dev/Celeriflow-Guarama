"use client";
import { useState } from "react";
import { RepeatableSstForm as SstForm } from "./RepeatableSstForm";
import { saveEvidence } from "./actions";
export function EvidenceForm({ catId, clinical, version, people, doctors }: { catId: string; clinical: boolean; version: number; people: { id: string; fullName: string }[]; doctors: { id: string; fullName: string; council: string }[] }) {
  const [kind, setKind] = useState("TECHNICAL");
  return <SstForm action={async form => {
    const value = (key: string) => String(form.get(key) || "");
    const data = kind === "INVESTIGATION" ? Object.fromEntries(["age", "education", "bmi", "otherEmployment", "overtimeHours", "climate", "humidity", "temperature", "causes", "preventiveMeasures"].map(key => [key, ["age", "bmi", "overtimeHours", "humidity", "temperature"].includes(key) ? Number(value(key)) : value(key)])) : kind === "ATTENDANCE" ? { attendedAt: value("attendedAt"), professionalRoleId: value("professionalRoleId"), injury: value("injury"), cidCodes: value("cidCodes").split(";").map(s => s.trim()).filter(Boolean), probableDiagnosis: value("probableDiagnosis"), observations: value("observations") } : { opinion: value("opinion") };
    form.set("data", JSON.stringify(data)); return saveEvidence(form);
  }}><input type="hidden" name="catId" value={catId} /><input type="hidden" name="expectedVersion" value={version} />
    <label>Registro<select name="kind" value={kind} onChange={e => setKind(e.target.value)} className="block rounded border p-2"><option value="TECHNICAL">Parecer técnico</option>{clinical && <><option value="INVESTIGATION">Nova revisão de investigação</option><option value="MEDICAL">Parecer médico</option><option value="ATTENDANCE">Atendimento médico</option></>}<option value="HOMOLOGATION">Homologação</option></select></label>
    {kind === "TECHNICAL" && <label>Responsável técnico no Cadastro Único<select name="personId" required className="block w-full rounded border p-2"><option value="">Busque o nome acima e selecione</option>{people.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>}
    {["MEDICAL","ATTENDANCE"].includes(kind) && <label>Médico habilitado<select name="professionalRoleId" required className="block w-full rounded border p-2"><option value="">Selecione</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.fullName} — {d.council}</option>)}</select></label>}
    <label><input type="checkbox" name="approved" /> Parecer favorável</label>
    <p>Nova investigação exige novos pareceres da revisão corrente para homologação.</p>
    {kind === "INVESTIGATION" ? <>
      {[["age","Idade"],["bmi","IMC"],["overtimeHours","Horas extras"],["humidity","Umidade (%)"],["temperature","Temperatura (°C)"]].map(([name,label]) => <label key={name}>{label}<input className="block border p-2" name={name} type="number" step="any" required /></label>)}
      {[["education","Escolaridade"],["otherEmployment","Outro emprego (informe ausência quando apurada)"],["climate","Clima"],["causes","Análise das causas"],["preventiveMeasures","Medidas preventivas"]].map(([name,label]) => <label key={name}>{label}<textarea className="block w-full border p-2" name={name} required /></label>)}
    </> : kind === "ATTENDANCE" ? <>
      <label>Data do atendimento<input name="attendedAt" type="datetime-local" required className="block border p-2" /></label>
      {[["injury","Lesão"],["cidCodes","CIDs (separar por ;)"],["probableDiagnosis","Diagnóstico provável"],["observations","Observações"]].map(([name,label]) => <label key={name}>{label}<textarea className="block w-full border p-2" name={name} required={name !== "observations"} /></label>)}
    </> : <label>Parecer / justificativa<textarea name="opinion" className="block w-full border p-2" required minLength={10} /></label>}
  </SstForm>;
}
