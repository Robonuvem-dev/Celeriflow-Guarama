"use client";
import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveSstProgram } from "./actions";
import { examOccasions, riskInput } from "@/lib/sst/program-policy";
import { SstTablePanel } from "../_components/SstTablePanel";
import { SstSelectionTable } from "../_components/SstSelectionTable";
import { sstColumn } from "../_components/operational-columns";
import { programDraftEntries } from "../_components/draft-payload";

const riskFields = [["description", "Risco"], ["danger", "Perigo"], ["possibleDamage", "Possíveis danos à saúde"], ["propagation", "Meios de propagação"], ["controls", "Medidas de controle"], ["sources", "Fontes geradoras"]] as const;
type Draft = Record<string, string | boolean>;
const control = "block w-full rounded border p-2";

export function ProgramForm({ budgetUnitId, groups, people }: { budgetUnitId: string; groups: { id: string; code: string; name: string }[]; people: { id: string; fullName: string }[] }) {
  const [kind, setKind] = useState("LTCAT"), [selected, setSelected] = useState<string[]>([]);
  const [riskRows, setRiskRows] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Draft>({});
  const [activeGroup, setActiveGroup] = useState("");
  const [riskIndex, setRiskIndex] = useState(0);
  const [occasion, setOccasion] = useState<string>(examOccasions[0]);
  const groupId = selected.includes(activeGroup) ? activeGroup : selected[0];
  const index = groupId ? Math.min(riskIndex, (riskRows[groupId] || 1) - 1) : 0;
  const value = (key: string) => String(draft[key] ?? "");
  const set = (key: string, next: string | boolean) => setDraft(current => ({ ...current, [key]: next }));
  const field = (name: string, label: string, required = false, type = "text") => <label>{label}<input name={name} required={required} type={type} className={control} /></label>;
  const draftField = (key: string, label: string, type = "text") => <label>{label}<input value={value(key)} type={type} onChange={event => set(key, event.target.value)} className={control} /></label>;
  return <SstForm action={async form => {
    for (const id of selected) {
      if (kind === "PCMSO") continue;
      if (value(`${id}.conditions`).trim().length < 2) return { error: `Informe condições ambientais do GHE ${groups.find(group => group.id === id)?.name || id}.` };
      for (let position = 0; position < (riskRows[id] || 1); position++) {
        const prefix = `${id}.risk.${position}`;
        if (!value(`${prefix}.exposureMinutes`).trim()) return { error: `Informe a exposição em minutos do risco ${position + 1} de ${id}.` };
        const parsed = riskInput.safeParse({ ...Object.fromEntries(riskFields.map(([key]) => [key, value(`${prefix}.${key}`)])), exposureMinutes: value(`${prefix}.exposureMinutes`), epiApplicable: draft[`${prefix}.epiApplicable`] === true, epis: value(`${prefix}.epis`).split(";").map(item => item.trim()).filter(Boolean), probability: value(`${prefix}.probability`), severity: value(`${prefix}.severity`) });
        if (!parsed.success) return { error: `GHE ${id}, risco ${position + 1}: ${parsed.error.issues[0]?.message || "Confira os campos."}` };
        if (kind === "PGR" && (parsed.data.probability === null || parsed.data.severity === null)) return { error: `O PGR exige probabilidade e severidade no risco ${position + 1} de ${id}.` };
      }
    }
    return saveSstProgram(form);
  }} redirectBase="/sst/programas" label="Registrar nova versão">
    <input name="budgetUnitId" value={budgetUnitId} type="hidden" />
    {programDraftEntries(draft, selected, kind).map(([name, content]) => <input key={name} name={name} type="hidden" value={content} />)}
    <label>Programa<select name="kind" value={kind} onChange={event => setKind(event.target.value)} className={control}><option value="LTCAT">LTCAT</option><option value="PGR">PGR</option><option value="PCMSO">PCMSO</option></select></label>
    {field("code", "Código (reutilizar o código gera uma nova versão)", true)}
    <label>Responsável técnico<select required name="responsiblePersonId" className={control}><option value="">Pesquise o responsável acima</option>{people.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
    {field("responsibleCouncil", "Conselho / UF / registro", true)}{field("startsAt", "Vigência inicial", true, "datetime-local")}{field("endsAt", "Vigência final", true, "datetime-local")}
    <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="font-semibold">Detalhes gerais {kind === "PCMSO" ? "(obrigatórios)" : "(opcionais)"}</legend>{[["objectives", "Objetivos"], ["responsibilities", "Responsabilidades"], ["procedures", "Procedimentos para exames ocupacionais"], ["records", "Registro e arquivo de informações"], ["firstAid", "Primeiros socorros"], ["campaigns", "Campanhas de saúde"]].map(([name, label]) => <label key={name}>{label}<textarea name={name} required={kind === "PCMSO"} minLength={kind === "PCMSO" ? 2 : undefined} className="block min-h-20 w-full rounded border p-2" /></label>)}</fieldset>
    <SstSelectionTable title="GHEs do programa" preferenceId="sst-programa-grupos-edicao" selected={selected} onSelectionAction={setSelected} name="groupId" columns={[sstColumn("code", "Código", 180, 100), sstColumn("name", "GHE", 400, 160)]} items={groups.map(group => ({ id: group.id, label: group.name, values: { code: group.code, name: group.name } }))} />
    {groupId && <section className="space-y-3 rounded border p-3"><label>GHE em edição<select value={groupId} onChange={event => { setActiveGroup(event.target.value); setRiskIndex(0); }} className={control}>{selected.map(id => <option key={id} value={id}>{groups.find(group => group.id === id)?.name || id}</option>)}</select></label>
      {kind !== "PCMSO" ? <><label>Condições ambientais<textarea value={value(`${groupId}.conditions`)} onChange={event => set(`${groupId}.conditions`, event.target.value)} className="block min-h-20 w-full rounded border p-2" /></label>
        <SstTablePanel title="Riscos do GHE" preferenceId="sst-programa-riscos-edicao" columns={[...riskFields.map(([key, label]) => sstColumn(key, label, 160, 85)), sstColumn("minutes", "Exposição (min/dia)", 140, 80), sstColumn("epi", "EPI aplicável", 110, 65), sstColumn("epis", "Equipamentos", 180, 95), sstColumn("probability", "Probabilidade", 120, 75), sstColumn("severity", "Severidade", 120, 75), sstColumn("actions", "Editar", 75, 65, "actions")]}
          rows={Array.from({ length: riskRows[groupId] || 1 }, (_, position) => { const prefix = `${groupId}.risk.${position}`; return { id: String(position), label: `Risco ${position + 1}`, values: { ...Object.fromEntries(riskFields.map(([key]) => [key, value(`${prefix}.${key}`)])), minutes: value(`${prefix}.exposureMinutes`), epi: draft[`${prefix}.epiApplicable`] ? "Sim" : "Não", epis: value(`${prefix}.epis`), probability: value(`${prefix}.probability`), severity: value(`${prefix}.severity`) }, actions: <button type="button" onClick={() => setRiskIndex(position)}>Editar</button> }; })} />
        <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend>Risco {index + 1}</legend>{riskFields.map(([key, label]) => <div key={key}>{draftField(`${groupId}.risk.${index}.${key}`, label)}</div>)}{draftField(`${groupId}.risk.${index}.exposureMinutes`, "Exposição (minutos por dia, 0 a 1440)", "number")}<label><input type="checkbox" checked={draft[`${groupId}.risk.${index}.epiApplicable`] === true} onChange={event => set(`${groupId}.risk.${index}.epiApplicable`, event.target.checked)} /> EPI aplicável</label>{draftField(`${groupId}.risk.${index}.epis`, "Equipamentos necessários (separados por ponto e vírgula)")}{draftField(`${groupId}.risk.${index}.probability`, "Probabilidade (1 a 5)", "number")}{draftField(`${groupId}.risk.${index}.severity`, "Severidade (1 a 5)", "number")}</fieldset>
        <button type="button" disabled={(riskRows[groupId] || 1) >= 10} onClick={() => { setRiskIndex(riskRows[groupId] || 1); setRiskRows(old => ({ ...old, [groupId]: (old[groupId] || 1) + 1 })); }} className="rounded border p-2">Adicionar risco</button>
      </> : <><SstTablePanel title="Exames PCMSO por ocasião" preferenceId="sst-programa-exames-edicao" columns={[sstColumn("occasion", "Ocasião", 220, 120), sstColumn("exams", "Exames previstos", 500, 180), sstColumn("actions", "Editar", 75, 65, "actions")]} rows={examOccasions.map(item => ({ id: item, label: item, values: { occasion: item, exams: value(`${groupId}.exam.${item}`) }, actions: <button type="button" onClick={() => setOccasion(item)}>Editar</button> }))} />{draftField(`${groupId}.exam.${occasion}`, `Exames ${occasion.toLowerCase().replaceAll("_", " ")} (separados por ponto e vírgula)`)}</>}
    </section>}
    <p className="text-xs text-slate-500">Versões registradas preservam conteúdo, critérios dos GHEs e responsabilidade técnica. Ajustes devem gerar uma nova versão.</p>
  </SstForm>;
}
