"use client";

import { useState } from "react";
import { ADULT_TEETH, CHILD_TEETH } from "@/lib/saude/care-lines-policy";
import { dentalMarkAction } from "./actions";

const conditions = { HEALTHY: "Hígido", CARIES: "Cárie", MISSING: "Ausente", RESTORED: "Restaurado", EXTRACTION_INDICATED: "Extração indicada", TREATMENT_PLANNED: "Tratamento planejado", TREATED: "Tratado" };
const colors: Record<string, string> = { HEALTHY: "bg-green-100", CARIES: "bg-red-200", MISSING: "bg-slate-300", RESTORED: "bg-blue-200", EXTRACTION_INDICATED: "bg-orange-200", TREATMENT_PLANNED: "bg-yellow-100", TREATED: "bg-teal-200" };
const regionCodes: Record<string, { value: string; label: string }[]> = {
  ARCH: [{ value: "UPPER", label: "Superior" }, { value: "LOWER", label: "Inferior" }],
  QUADRANT: ["1", "2", "3", "4"].map(value => ({ value, label: `Quadrante ${value}` })),
  MOUTH: [{ value: "ALL", label: "Boca inteira" }],
  SEXTANT: ["1", "2", "3", "4", "5", "6"].map(value => ({ value, label: `Sextante ${value}` })),
};
type Mark = { id: string; targetType: string; targetCode: string; condition: string; notes: string; createdAt: string; performedAt: string | null; surface: string | null };
export function Odontogram({ medicalRecordId, marks, procedures }: { medicalRecordId: string; marks: Mark[]; procedures: { id: string; name: string }[] }) {
  const [dentition, setDentition] = useState("ADULT");
  const [targetType, setTargetType] = useState("TOOTH");
  const [targetCode, setTargetCode] = useState("11");
  const field = "rounded border bg-white p-2 text-sm";
  const tooth = (code: string) => {
    const latest = marks.find(mark => mark.targetType === "TOOTH" && mark.targetCode === code);
    const selected = targetType === "TOOTH" && targetCode === code;
    return <button key={code} type="button" aria-pressed={selected} aria-label={`Dente ${code}: ${latest ? conditions[latest.condition as keyof typeof conditions] : "Sem marcação"}`} title={latest?.notes} onClick={() => { setTargetType("TOOTH"); setTargetCode(code); }} className={`flex h-16 min-w-9 flex-col items-center justify-center rounded border ${selected ? "ring-2 ring-blue-700" : ""} ${latest ? colors[latest.condition] : "bg-white"}`}><svg aria-hidden="true" viewBox="0 0 24 32" className="h-8 w-6"><path d="M12 3 C3 -2 1 6 4 14 C5 18 5 29 8 29 C10 29 9 20 12 19 C15 20 14 29 16 29 C19 29 19 18 20 14 C23 6 21 -2 12 3 Z" fill="white" stroke="currentColor" strokeWidth="1.5" /><path d="M7 8 Q12 11 17 8" fill="none" stroke="currentColor" /></svg><span className="text-xs">{code}</span></button>;
  };
  return <div className="space-y-3">
    <label className="flex items-center gap-2 text-sm">Dentição<select value={dentition} onChange={event => { setDentition(event.target.value); setTargetCode(event.target.value === "CHILD" ? "51" : "11"); }} className={field}><option value="ADULT">Adulta</option><option value="CHILD">Infantil</option><option value="BOTH">Ambas</option></select></label>
    <div className="overflow-x-auto rounded border p-3">
      {dentition !== "CHILD" && <div className="mb-4 space-y-2"><p className="text-sm font-semibold">Permanentes · superior / inferior</p><div className="flex min-w-max gap-1">{ADULT_TEETH.slice(0, 16).map(tooth)}</div><div className="flex min-w-max gap-1">{ADULT_TEETH.slice(16).map(tooth)}</div></div>}
      {dentition !== "ADULT" && <div className="space-y-2"><p className="text-sm font-semibold">Decíduos · superior / inferior</p><div className="flex min-w-max gap-1">{CHILD_TEETH.slice(0, 10).map(tooth)}</div><div className="flex min-w-max gap-1">{CHILD_TEETH.slice(10).map(tooth)}</div></div>}
    </div>
    <div className="flex flex-wrap gap-2 text-xs">{Object.entries(conditions).map(([key, label]) => <span key={key} className={`rounded p-1 ${colors[key]}`}>{label}</span>)}</div>
    <form action={dentalMarkAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="medicalRecordId" value={medicalRecordId} /><input type="hidden" name="dentition" value={dentition} />
      <label className="grid gap-1 text-sm">Tipo de marcação<select name="targetType" value={targetType} onChange={event => { setTargetType(event.target.value); setTargetCode(event.target.value === "TOOTH" ? dentition === "CHILD" ? "51" : "11" : regionCodes[event.target.value][0].value); }} className={field}><option value="TOOTH">Dente</option><option value="ARCH">Arcada</option><option value="QUADRANT">Quadrante</option><option value="MOUTH">Boca</option><option value="SEXTANT">Sextante</option></select></label>
      <label className="grid gap-1 text-sm">Região{targetType === "TOOTH" ? <select name="targetCode" value={targetCode} onChange={event => setTargetCode(event.target.value)} className={field}>{(dentition === "ADULT" ? ADULT_TEETH : dentition === "CHILD" ? CHILD_TEETH : [...ADULT_TEETH, ...CHILD_TEETH]).map(code => <option key={code}>{code}</option>)}</select> : <select name="targetCode" value={targetCode} onChange={event => setTargetCode(event.target.value)} className={field}>{regionCodes[targetType].map(code => <option key={code.value} value={code.value}>{code.label}</option>)}</select>}</label>
      <label className="grid gap-1 text-sm">Situação<select name="condition" className={field}>{Object.entries(conditions).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      {targetType === "TOOTH" && <label className="grid gap-1 text-sm">Superfície<select name="surface" className={field}><option value="">Dente inteiro</option>{[["M", "Mesial"], ["D", "Distal"], ["O", "Oclusal"], ["V", "Vestibular"], ["L", "Lingual"], ["I", "Incisal"], ["P", "Palatina"]].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">Procedimento SIGTAP<select name="procedureId" className={field}><option value="">Sem procedimento</option>{procedures.map(procedure => <option key={procedure.id} value={procedure.id}>{procedure.name}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="performed" />Procedimento realizado neste atendimento</label>
      <label className="grid gap-1 text-sm sm:col-span-2">Evolução odontológica<textarea name="notes" required className={field} /></label><button className={field}>Registrar marcação e ato associado</button>
    </form>
    <details><summary className="text-sm font-semibold">Histórico das marcações</summary>{marks.map(mark => <p key={mark.id} className="border-t py-2 text-sm">{new Date(mark.createdAt).toLocaleString("pt-BR")} · {mark.targetType} {mark.targetCode}{mark.surface ? ` / ${mark.surface}` : ""} · {conditions[mark.condition as keyof typeof conditions]} · {mark.notes}{mark.performedAt ? " · procedimento realizado" : ""}</p>)}</details>
  </div>;
}
