"use client";
import { createContext, useContext, useState } from "react";
import { SstForm } from "../SstForm";
import { preventionFields, type Field } from "@/lib/sst/prevention-fields";
import { preventionKinds, type PreventionPayload } from "@/lib/sst/prevention-policy";
import { savePrevention } from "./actions";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
import { QuestionnaireAnswersEditor } from "../_components/QuestionnaireAnswersEditor";
import type { Question } from "@/lib/sst/questionnaire-policy";
type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
type ObjectValue = { [key: string]: Value };
export type References = Record<string, { id: string; label: string }[]>;
const UnitContext = createContext("");
function ReferenceSelect({ field, value, onChange, refs }: { field: Field; value: Value; onChange: (v: Value) => void; refs: References }) {
  const budgetUnitId = useContext(UnitContext);
  const [q, setQ] = useState(""), [matches, setMatches] = useState<{ id: string; label: string }[] | null>(null), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [known, setKnown] = useState(refs[field.ref!] || []);
  const initial = refs[field.ref!] || [], selected = known.find(r => r.id === value);
  const options = matches === null ? initial : selected && !matches.some(r => r.id === selected.id) ? [selected, ...matches] : matches;
  return <span className="grid gap-2"><span className="flex gap-2"><input aria-label={`Buscar ${field.label}`} placeholder="Buscar por nome / identificação" className="min-w-0 flex-1 rounded border p-2" value={q} onChange={e => setQ(e.target.value)} /><button type="button" disabled={pending} className="rounded border px-2" onClick={async () => {
    setPending(true); setError("");
    try { const response = await fetch(`/sst/prevencao/referencias?${new URLSearchParams({ budgetUnitId, type: field.ref!, q })}`); if (!response.ok) throw new Error(); const found: { id: string; label: string }[] = await response.json(); setMatches(found); setKnown(old => [...old, ...found.filter(r => !old.some(v => v.id === r.id))]); } catch { setError("Busca indisponível."); } finally { setPending(false); }
  }}>{pending ? "…" : "Buscar"}</button></span><select aria-label={field.label} className="w-full rounded border bg-transparent p-2 focus-visible:outline-teal-700" value={String(value || "")} onChange={e => onChange(e.target.value)}><option value="">Selecione</option>{options.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>{matches?.length === 20 && <span className="text-xs">Primeiros 20 resultados. Refine a busca pelo nome.</span>}{error && <span role="alert" className="text-red-700">{error}</span>}</span>;
}
function initial(fields: Field[]): ObjectValue { return Object.fromEntries(fields.map(f => [f.key, f.many ? [] : f.type === "boolean" ? false : f.choices?.[0] || ""])); }
function serialize(fields: Field[], values: ObjectValue): ObjectValue {
  const out: ObjectValue = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.optional && !value) continue;
    out[field.key] = field.fields ? (value as ObjectValue[]).map(v => serialize(field.fields!, v)) : field.type === "date" && value ? new Date(String(value)).toISOString() : field.type === "cost" && /^\d+(\.\d{1,2})?$/.test(String(value)) ? `${String(value).split(".")[0]}.${(String(value).split(".")[1] || "").padEnd(2, "0")}` : value;
  }
  return out;
}
function Fields({ fields, values, onChange, refs }: { fields: Field[]; values: ObjectValue; onChange: (v: ObjectValue) => void; refs: References }) {
  const set = (key: string, value: Value) => onChange({ ...values, [key]: value });
  return <div className="grid gap-4 sm:grid-cols-2">{fields.map(field => {
    const value = values[field.key];
    if (field.many) {
      const items = (value || []) as Value[];
      return <RepeatedFieldEditor key={field.key} field={field} items={items} onChangeAction={next => set(field.key, next)} refs={refs} />;
    }
    return <label key={field.key} className={field.type === "long" ? "col-span-full grid gap-1" : "grid gap-1"}>{field.label}{field.optional ? " (opcional)" : ""}<Scalar field={field} value={value} onChange={v => set(field.key, v)} refs={refs} /></label>;
  })}</div>;
}
function repeatedValue(field: Field, value: Value, refs: References): string {
  if (field.ref) return refs[field.ref]?.find(item => item.id === value)?.label || String(value ?? "");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value ?? "");
}
function RepeatedFieldEditor({ field, items, onChangeAction, refs }: { field: Field; items: Value[]; onChangeAction: (items: Value[]) => void; refs: References }) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, items.length - 1), item = items[index];
  const definitions = field.fields || [{ ...field, many: false }];
  return <fieldset className="col-span-full grid gap-3 rounded border p-3"><legend className="font-semibold">{field.label}</legend>
    <SstTablePanel title={field.label} preferenceId={`sst-prevencao-edicao-${field.key}`} description="Coleção completa no estado do pai e no payload; selecione uma linha e feche para editar seus campos."
      columns={[...definitions.map(definition => sstColumn(definition.key, definition.label, 220, 110)), sstColumn("__rowActions", "Ações", 145, 135, "actions")]}
      rows={items.map((value, position) => ({ id: String(position), label: `${field.label} ${position + 1}`, values: Object.fromEntries(definitions.map(definition => [definition.key, repeatedValue(definition, field.fields ? (value as ObjectValue)[definition.key] : value, refs)])), actions: <><button type="button" onClick={() => setSelected(position)}>Editar</button> <button type="button" onClick={() => onChangeAction(items.filter((_, i) => i !== position))}>Remover</button></> }))} />
    {index >= 0 && <section className="space-y-2"><h3 className="font-semibold">{field.label} {index + 1}</h3>{field.fields ? <Fields fields={field.fields} values={item as ObjectValue} onChange={next => onChangeAction(items.map((old, i) => i === index ? next : old))} refs={refs} /> : <label>{field.label}<Scalar field={{ ...field, many: false }} value={item} onChange={next => onChangeAction(items.map((old, i) => i === index ? next : old))} refs={refs} /></label>}</section>}
    <button type="button" className="w-fit rounded border px-3 py-2" disabled={items.length >= 100} onClick={() => { setSelected(items.length); onChangeAction([...items, field.fields ? initial(field.fields) : ""]); }}>Adicionar {field.label.toLowerCase()}</button>
  </fieldset>;
}
function Scalar({ field, value, onChange, refs }: { field: Field; value: Value; onChange: (v: Value) => void; refs: References }) {
  const cls = "w-full rounded border bg-transparent p-2 focus-visible:outline-teal-700";
  if (field.type === "boolean") return <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} className="size-5" />;
  if (field.ref) return <ReferenceSelect field={field} value={value} onChange={onChange} refs={refs} />;
  if (field.choices) return <select className={cls} value={String(value || "")} onChange={e => onChange(e.target.value)}>{field.choices.map(v => <option key={v}>{v}</option>)}</select>;
  if (field.type === "long") return <textarea rows={3} className={cls} value={String(value || "")} onChange={e => onChange(e.target.value)} />;
  return <input className={cls} type={field.type === "date" ? "datetime-local" : field.type === "number" || field.type === "cost" ? "number" : "text"} step={field.type === "cost" ? "0.01" : "any"} value={value == null ? "" : String(value)} onChange={e => onChange(field.type === "number" && e.target.value ? Number(e.target.value) : field.type === "cost" && e.target.value ? e.target.value : e.target.value)} onBlur={e => { if (field.type === "cost" && /^\d+(\.\d{1,2})?$/.test(e.target.value)) { const [whole, frac = ""] = e.target.value.split("."); onChange(`${whole}.${frac.padEnd(2, "0")}`); } }} />;
}
export function PreventionForm({ budgetUnitId, kind, refs }: { budgetUnitId: string; kind: PreventionPayload["kind"]; refs: References }) {
  const fields = preventionFields[kind];
  const [values, setValues] = useState<ObjectValue>(() => initial(fields));
  const [answers, setAnswers] = useState<ObjectValue>({});
  const [attachments, setAttachments] = useState<ObjectValue[]>([]);
  const [uploadError, setUploadError] = useState("");
  const operationalAnswers = Object.fromEntries(((values.questions || []) as ObjectValue[]).filter(q => q.key).map(q => [String(q.key), answers[String(q.key)] ?? (q.kind === "BOOLEAN" ? false : null)]));
  const payload = { kind, ...serialize(fields, values), ...(kind === "INSPECTION" ? { formScope: "SST_OPERATIONAL_INSPECTION", answers: operationalAnswers } : {}), ...(["ERGONOMICS", "AUDIOMETRY"].includes(kind) ? { attachments } : {}) };
  const submit = async (form: FormData): Promise<{ error: string | null; id?: string }> => {
    // Large protected attachments use a Route Handler rather than Next's 1 MB Server Action transport.
    if (String(form.get("payload")).length < 500000) return savePrevention(form);
    const response = await fetch("/sst/prevencao/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    if (!response.ok) return { error: response.status === 413 ? "Anexos excedem o limite total permitido." : "Não foi possível gravar o registro e seus anexos." };
    return response.json();
  };
  return <UnitContext.Provider value={budgetUnitId}><SstForm action={submit} redirectBase="/sst/prevencao"><h2 className="text-lg font-semibold">{preventionKinds[kind]}</h2><input type="hidden" name="budgetUnitId" value={budgetUnitId} /><input type="hidden" name="payload" value={JSON.stringify(payload)} />
    <label className="grid gap-1">Título<input name="title" required maxLength={200} className="rounded border p-2" /></label>
    <Fields fields={fields} values={values} onChange={setValues} refs={refs} />
    {kind === "INSPECTION" && <QuestionnaireAnswersEditor title="Respostas da inspeção" preferenceId="sst-prevencao-respostas-edicao" questions={((values.questions || []) as ObjectValue[]).map((question, i) => ({ key: String(question.key || `draft_${i}`), label: String(question.label || `Pergunta ${i + 1}`), section: String(question.section || "Geral"), kind: (question.kind || "TEXT") as Question["kind"], required: question.required === true, choices: (question.choices || []) as string[] }))} answers={operationalAnswers} onAnswerAction={(key, next) => setAnswers(current => ({ ...current, [key]: next }))} />}
    {["ERGONOMICS", "AUDIOMETRY"].includes(kind) && <label className="grid gap-2">Anexos protegidos (PDF, PNG ou JPEG; até 5 de 2 MB)<input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={async e => {
      setUploadError(""); const files = Array.from(e.target.files || []);
      if (files.length > 5 || files.some(f => f.size > 2 * 1024 * 1024)) { setUploadError("Limite: 5 arquivos de 2 MB."); setAttachments([]); return; }
      try { const result = await Promise.all(files.map(file => new Promise<ObjectValue>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve({ name: file.name, mime: file.type, base64: String(reader.result).split(",")[1] }); reader.readAsDataURL(file); }))); setAttachments(result); } catch { setUploadError("Não foi possível ler o anexo."); }
    }} />{uploadError && <span role="alert" className="text-red-700">{uploadError}</span>}</label>}
  </SstForm></UnitContext.Provider>;
}
