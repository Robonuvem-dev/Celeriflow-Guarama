"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReferencePicker, fieldClass } from "../ReferencePicker";
import { fleetControlAction } from "./actions";
import { fleetControlForms } from "./forms";
import type { FleetControlOperation } from "@/lib/frotas/control-policy";

export function FleetControlForm({ operation, initial = {}, departmentId }: { operation: FleetControlOperation; initial?: Record<string, unknown>; departmentId: string }) {
  const definition = fleetControlForms[operation], router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ departmentId, ...Object.fromEntries(definition.fields.map((field) => [field.key, initial[field.key] ?? field.default ?? (field.type === "boolean" ? false : field.type === "categories" ? [] : field.type === "json" ? {} : "")])), ...initial }));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [pending, startTransition] = useTransition(), [message, setMessage] = useState(""), [token, setToken] = useState("");
  const [machineFields, setMachineFields] = useState<{ code: string; label: string; type: string; required: boolean; options: string[] }[]>([]);
  useEffect(() => {
    if (!values.machineTypeId) return;
    const controller = new AbortController();
    void fetch(`/api/frotas/controle/maquinas/${values.machineTypeId}`, { signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setMachineFields(data.fields); }).catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Falha na configuração da máquina."); });
    return () => controller.abort();
  }, [values.machineTypeId]);
  function set(key: string, value: unknown) { setValues((current) => ({ ...current, [key]: value })); }
  function display(value: unknown, type?: string) { const text = typeof value === "string" ? value : String(value || ""); return type === "datetime-local" && text.endsWith("Z") ? new Date(text).toLocaleString("sv-SE").replace(" ", "T").slice(0, 16) : type === "date" ? text.slice(0, 10) : text; }
  return <form className="grid gap-4 rounded-lg border border-slate-300 bg-white p-5 md:grid-cols-2" onSubmit={(event) => {
    event.preventDefault(); setMessage(""); setToken("");
    const data: Record<string, unknown> = {};
    try {
      for (const field of definition.fields) {
        const value = values[field.key];
        if (field.type === "json") data[field.key] = field.key === "machineValues" && machineFields.length ? value || {} : typeof value === "string" ? JSON.parse(value || (field.key === "entries" || field.key === "fields" || field.key === "parties" ? "[]" : "{}")) : value;
        else if (field.type === "datetime-local") data[field.key] = new Date(String(value)).toISOString();
        else if (field.type === "boolean" || field.type === "categories") data[field.key] = value;
        else if (operation === "occurrence" && ["latitude", "longitude"].includes(field.key)) data[field.key] = value === "" || value === null ? null : Number(value);
        else data[field.key] = String(value ?? "");
      }
    } catch { setMessage("Confira datas e campos JSON antes de enviar."); return; }
    startTransition(async () => {
      try { const result = await fleetControlAction({ requestId, operation, data }); if (!('id' in result)) setMessage(result.error); else { setMessage(`Registrado: ${result.id}${result.repeated ? " (confirmação anterior recuperada)" : ""}`); setToken(result.token || ""); setRequestId(crypto.randomUUID()); router.refresh(); } }
      catch { setMessage("Resposta não disponível. Reenvie os mesmos dados para recuperar a confirmação."); }
    });
  }}>
    <h2 className="text-lg font-semibold text-slate-900 md:col-span-2">{definition.title}</h2>
    {definition.fields.map((field) => <div key={field.key} className={["textarea", "json", "categories"].includes(field.type || "") ? "md:col-span-2" : ""}>
      <label htmlFor={`control-${operation}-${field.key}`} className="mb-2 block text-sm font-semibold text-slate-700">{field.label}{field.required ? " *" : ""}</label>
      {field.reference ? <ReferencePicker id={`control-${operation}-${field.key}`} kind={field.reference} endpoint={field.extendedReference ? "/api/frotas/controle/referencias" : "/api/frotas/referencias"} label={field.label} value={String(values[field.key] || "")} unitId={String(values.unitId || "")} departmentId={String(values.departmentId || "")} required={field.required} onChange={(value) => set(field.key, value)} />
        : field.type === "boolean" ? <input id={`control-${operation}-${field.key}`} type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => set(field.key, event.target.checked)} />
        : field.type === "categories" ? <fieldset className="flex flex-wrap gap-4 rounded border p-3"><legend className="sr-only">{field.label}</legend>{["A", "B", "C", "D", "E"].map((category) => <label key={category} className="text-sm"><input type="checkbox" className="mr-2" checked={Array.isArray(values[field.key]) && (values[field.key] as string[]).includes(category)} onChange={(event) => set(field.key, event.target.checked ? [...(values[field.key] as string[] || []), category] : (values[field.key] as string[] || []).filter((value) => value !== category))} />{category}</label>)}</fieldset>
        : field.key === "machineValues" && machineFields.length ? <div className="grid gap-3 md:grid-cols-2">{machineFields.map((machine) => <label key={machine.code} className="text-sm">{machine.label}{machine.required ? " *" : ""}{machine.type === "SELECT" ? <select required={machine.required} value={(values.machineValues as Record<string, string>)?.[machine.code] || ""} onChange={(event) => set("machineValues", { ...(values.machineValues as object || {}), [machine.code]: event.target.value })} className={fieldClass}><option value="">Selecione</option>{machine.options.map((option) => <option key={option}>{option}</option>)}</select> : <input required={machine.required} type={machine.type === "DATE" ? "date" : machine.type === "NUMBER" ? "number" : "text"} step="any" value={(values.machineValues as Record<string, string>)?.[machine.code] || ""} onChange={(event) => set("machineValues", { ...(values.machineValues as object || {}), [machine.code]: event.target.value })} className={fieldClass} />}</label>)}</div>
        : field.options ? <select id={`control-${operation}-${field.key}`} value={String(values[field.key] || field.options[0])} onChange={(event) => set(field.key, event.target.value)} className={fieldClass}>{field.options.map((value) => <option key={value}>{value}</option>)}</select>
        : field.type === "json" || field.type === "textarea" ? <textarea id={`control-${operation}-${field.key}`} required={field.required} rows={field.type === "json" ? 8 : 3} value={typeof values[field.key] === "string" ? values[field.key] as string : JSON.stringify(values[field.key], null, 2)} onChange={(event) => set(field.key, event.target.value)} className={fieldClass + (field.type === "json" ? " font-mono text-xs" : "")} />
        : <input id={`control-${operation}-${field.key}`} required={field.required} type={field.type === "date" || field.type === "datetime-local" ? field.type : "text"} inputMode={field.type === "number" ? "decimal" : undefined} value={display(values[field.key], field.type)} onChange={(event) => set(field.key, event.target.value)} className={fieldClass} />}
    </div>)}
    <button disabled={pending} className="w-fit rounded bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Confirmando…" : "Confirmar operação"}</button>
    <p role="status" className="whitespace-pre-wrap text-sm md:col-span-2">{message}</p>
    {token && <div className="rounded border border-emerald-200 bg-emerald-50 p-4 md:col-span-2"><p className="text-sm font-semibold">Código externo de conferência — entregue somente ao prestador da autorização</p><code className="mt-2 block break-all text-sm">{token}</code><button type="button" className="mt-3 text-sm font-semibold underline" onClick={() => navigator.clipboard.writeText(token)}>Copiar código</button><p className="mt-2 text-xs leading-5">O código é exibido nesta confirmação. A reemissão revoga o anterior e não cria nova autorização ou despesa.</p></div>}
  </form>;
}
