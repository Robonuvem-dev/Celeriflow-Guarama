"use client";
import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveSstProgram } from "./actions";
import { examOccasions } from "@/lib/sst/program-policy";

export function ProgramForm({ budgetUnitId, groups, people }: { budgetUnitId: string; groups: { id: string; code: string; name: string }[]; people: { id: string; fullName: string }[] }) {
  const [kind, setKind] = useState("LTCAT");
  const [selected, setSelected] = useState<string[]>([]);
  const [riskRows, setRiskRows] = useState<Record<string, number>>({});
  const field = (name: string, label: string, required = false, type = "text") => <label>{label}<input name={name} required={required} type={type} className="block w-full rounded border p-2"/></label>;
  return <SstForm action={saveSstProgram} redirectBase="/sst/programas" label="Registrar nova versão">
    <input name="budgetUnitId" value={budgetUnitId} type="hidden"/>
    <label>Programa<select name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className="block rounded border p-2"><option value="LTCAT">LTCAT</option><option value="PGR">PGR</option><option value="PCMSO">PCMSO</option></select></label>
    {field("code", "Código (reutilizar o código gera uma nova versão)", true)}
    <label>Responsável técnico<select required name="responsiblePersonId" className="block rounded border p-2"><option value="">Pesquise o responsável acima</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
    {field("responsibleCouncil", "Conselho / UF / registro", true)}
    {field("startsAt", "Vigência inicial", true, "datetime-local")}{field("endsAt", "Vigência final", true, "datetime-local")}
    <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="font-semibold">Detalhes gerais {kind === "PCMSO" ? "(obrigatórios)" : "(opcionais)"}</legend>{[["objectives", "Objetivos"], ["responsibilities", "Responsabilidades"], ["procedures", "Procedimentos para exames ocupacionais"], ["records", "Registro e arquivo de informações"], ["firstAid", "Primeiros socorros"], ["campaigns", "Campanhas de saúde"]].map(([name, label]) => <label key={name}>{label}<textarea name={name} required={kind === "PCMSO"} minLength={kind === "PCMSO" ? 2 : undefined} className="block min-h-20 w-full rounded border p-2"/></label>)}</fieldset>
    <fieldset className="space-y-2"><legend className="font-semibold">GHEs do programa</legend>{groups.map((group) => <label className="mr-4 inline-block" key={group.id}><input name="groupId" type="checkbox" value={group.id} checked={selected.includes(group.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, group.id] : old.filter((id) => id !== group.id))} className="mr-2"/>{group.code} · {group.name}</label>)}</fieldset>
    {selected.map((groupId) => <fieldset key={groupId} className="space-y-3 rounded border p-3"><legend className="font-semibold">{groups.find((group) => group.id === groupId)?.name}</legend>
      {kind !== "PCMSO" && <><label>Condições ambientais<textarea required minLength={2} name={`${groupId}.conditions`} className="block min-h-20 w-full rounded border p-2"/></label>
        {Array.from({ length: riskRows[groupId] || 1 }, (_, index) => <fieldset key={index} className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend>Risco {index + 1}</legend>{[["description", "Risco"], ["danger", "Perigo"], ["possibleDamage", "Possíveis danos à saúde"], ["propagation", "Meios de propagação"], ["controls", "Medidas de controle"], ["sources", "Fontes geradoras"]].map(([name, label]) => <div key={name}>{field(`${groupId}.risk.${index}.${name}`, label, true)}</div>)}
          {field(`${groupId}.risk.${index}.exposureMinutes`, "Exposição (minutos por dia, 0 a 1440)", true, "number")}
          <label><input name={`${groupId}.risk.${index}.epiApplicable`} type="checkbox" className="mr-2"/>EPI aplicável</label>
          {field(`${groupId}.risk.${index}.epis`, "Equipamentos necessários (separados por ponto e vírgula)")}
          {field(`${groupId}.risk.${index}.probability`, "Probabilidade (1 a 5)", kind === "PGR", "number")}
          {field(`${groupId}.risk.${index}.severity`, "Severidade (1 a 5)", kind === "PGR", "number")}
        </fieldset>)}
        <button type="button" disabled={(riskRows[groupId] || 1) >= 10} onClick={() => setRiskRows((old) => ({ ...old, [groupId]: (old[groupId] || 1) + 1 }))} className="rounded border p-2">Adicionar risco</button>
      </>}
      {kind === "PCMSO" && <div className="grid gap-3 sm:grid-cols-2">{examOccasions.map((occasion) => <div key={occasion}>{field(`${groupId}.exam.${occasion}`, `Exames ${occasion.toLowerCase().replaceAll("_", " ")} (separados por ponto e vírgula)`)}</div>)}</div>}
    </fieldset>)}
    <p className="text-xs text-slate-500">Versões registradas preservam conteúdo, critérios dos GHEs e responsabilidade técnica. Ajustes devem gerar uma nova versão.</p>
  </SstForm>;
}
