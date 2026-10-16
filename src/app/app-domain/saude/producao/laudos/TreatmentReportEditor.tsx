"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveTreatmentReportAction } from "./actions";

type Option = { id: string; name: string };
type ProcedureOption = { id: string; code: string; description: string };
type ProcedureLine = { key: string; selected: ProcedureOption | null; role: string; quantity: number; performerProfessionalId: string | null };
export type TreatmentReportEditorData = {
  id: string; version: number; kind: string; patientId: string; unitId: string; medicalRecordId: string | null;
  diagnosis: string; diagnosticCode: string | null; clinicalHistory: string; examinations: string; treatmentJustification: string;
  admissionAt: string | null; plannedStart: string; plannedEnd: string; initialApac: boolean;
  procedures: { procedure: ProcedureOption; role: string; quantity: number; performerProfessionalId: string | null }[];
};
const field = "w-full rounded border border-slate-300 bg-white p-2 text-sm";

export function ProcedureField({ selected: initial }: { selected: ProcedureOption | null }) {
  const [selected, setSelected] = useState(initial), [query, setQuery] = useState(initial ? `${initial.code} · ${initial.description}` : ""), [items, setItems] = useState<ProcedureOption[]>([]), [error, setError] = useState("");
  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/saude/catalogos?type=procedure&q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Não foi possível consultar o catálogo SUS.");
        const data = await response.json(); setItems(data.items || []);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha na pesquisa."); });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, selected]);
  return <div className="relative"><label className="text-sm">Procedimento SUS<input value={query} required onChange={event => { setQuery(event.target.value); setSelected(null); setItems([]); setError(""); }} placeholder="Pesquise código ou descrição e selecione" autoComplete="off" className={field}/></label><input type="hidden" name="procedureId" value={selected?.id || ""}/>{items.length > 0 && <ul className="absolute z-20 max-h-60 w-full overflow-y-auto rounded border bg-white shadow">{items.map(item => <li key={item.id}><button type="button" className="w-full border-b p-2 text-left text-sm hover:bg-slate-100" onClick={() => { setSelected(item); setQuery(`${item.code} · ${item.description}`); setItems([]); }}>{item.code} · {item.description}</button></li>)}</ul>}{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</div>;
}
function Submit() { const { pending } = useFormStatus(); return <button disabled={pending} className="rounded bg-teal-700 p-2 font-semibold text-white md:col-span-2">{pending ? "Salvando…" : "Salvar laudo e abrir PDF"}</button>; }

export function TreatmentReportEditor({ report, patients, units, professional, performers }: { report?: TreatmentReportEditorData; patients: Option[]; units: Option[]; professional: Option; performers: Option[] }) {
  const [kind, setKind] = useState(report?.kind || "AIH");
  const [lines, setLines] = useState<ProcedureLine[]>(report?.procedures.map((item, index) => ({ key: `line-${index}`, selected: item.procedure, role: item.role, quantity: item.quantity, performerProfessionalId: item.performerProfessionalId })) || [{ key: "line-0", selected: null, role: "PRIMARY", quantity: 1, performerProfessionalId: professional.id }]);
  return <form action={saveTreatmentReportAction} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-2">
    <input name="reportId" type="hidden" value={report?.id || ""}/><input name="expectedVersion" type="hidden" value={report?.version || 0}/><input name="professionalId" type="hidden" value={professional.id}/>
    <p className="text-sm md:col-span-2">Profissional emissor: {professional.name}{report ? ` · revisão da versão ${report.version}` : ""}</p>
    <label className="text-sm">Tipo de laudo{report ? <><input name="kind" type="hidden" value={kind}/><p>{kind}</p></> : <select name="kind" value={kind} onChange={event => setKind(event.target.value)} className={field}><option>AIH</option><option>APAC</option></select>}</label>
    <label className="text-sm">Paciente{report ? <><input name="patientId" type="hidden" value={report.patientId}/><p>{patients.find(patient => patient.id === report.patientId)?.name || report.patientId}</p></> : <select name="patientId" required className={field}><option value="">Selecione</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select>}</label>
    <label className="text-sm">Unidade solicitante{report ? <><input name="unitId" type="hidden" value={report.unitId}/><p>{units.find(unit => unit.id === report.unitId)?.name || report.unitId}</p></> : <select name="unitId" required className={field}><option value="">Selecione</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>}</label>
    <label className="text-sm">Atendimento de origem (identificador, opcional)<input name="medicalRecordId" defaultValue={report?.medicalRecordId || ""} className={field}/></label>
    <label className="text-sm">Diagnóstico<textarea name="diagnosis" required minLength={3} defaultValue={report?.diagnosis} className={field}/></label>
    <label className="text-sm">Código diagnóstico<input name="diagnosticCode" maxLength={30} defaultValue={report?.diagnosticCode || ""} className={field}/></label>
    <label className="text-sm">História clínica<textarea name="clinicalHistory" required minLength={3} defaultValue={report?.clinicalHistory} className={field}/></label>
    <label className="text-sm">Exames e resultados<textarea name="examinations" required minLength={3} defaultValue={report?.examinations} className={field}/></label>
    <label className="text-sm md:col-span-2">Justificativa e indicação do tratamento<textarea name="treatmentJustification" required minLength={3} defaultValue={report?.treatmentJustification} className={field}/></label>
    <label className="text-sm">Início previsto<input type="date" name="plannedStart" required defaultValue={report?.plannedStart} className={field}/></label><label className="text-sm">Fim previsto<input type="date" name="plannedEnd" required defaultValue={report?.plannedEnd} className={field}/></label>
    {kind === "AIH" ? <label className="text-sm md:col-span-2">Data e hora de internação<input type="datetime-local" name="admissionAt" required defaultValue={report?.admissionAt || ""} className={field}/></label> : <label className="text-sm md:col-span-2"><input type="checkbox" name="initialApac" defaultChecked={report?.initialApac ?? true}/> APAC do tipo inicial</label>}
    <section className="space-y-3 md:col-span-2"><h2 className="font-semibold">Procedimentos solicitados e profissionais envolvidos</h2>{lines.map(line => <fieldset key={line.key} className="grid gap-2 rounded border p-3 md:grid-cols-2"><ProcedureField selected={line.selected}/><label className="text-sm">Papel<select name="procedureRole" defaultValue={line.role} className={field}><option value="PRIMARY">Principal</option><option value="SECONDARY">Secundário</option></select></label><label className="text-sm">Quantidade<input name="procedureQuantity" type="number" min={1} max={9999} required defaultValue={line.quantity} className={field}/></label><label className="text-sm">Profissional executor<select name="performerProfessionalId" defaultValue={line.performerProfessionalId || ""} className={field}><option value="">Não informado</option>{performers.map(performer => <option key={performer.id} value={performer.id}>{performer.name}</option>)}</select></label>{lines.length > 1 && <button type="button" className="text-left text-sm text-red-700" onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Remover procedimento</button>}</fieldset>)}<button type="button" disabled={lines.length >= 100} className="rounded border p-2 text-sm" onClick={() => setLines(current => [...current, { key: crypto.randomUUID(), selected: null, role: "SECONDARY", quantity: 1, performerProfessionalId: null }])}>Adicionar procedimento</button></section>
    <label className="text-sm md:col-span-2">Motivo da inclusão ou revisão<input name="reason" required minLength={3} className={field}/></label><Submit/>
  </form>;
}
