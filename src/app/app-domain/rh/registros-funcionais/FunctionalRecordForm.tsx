"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { functionalDefinition, type FunctionalKind } from "@/lib/rh/functional-records";
import { ReferenceLookup } from "../operacoes/ReferenceLookup";
import { saveFunctionalRecordAction } from "./actions";

type Values = { id: string; version: number; key: string; name: string; employeeId: string | null; contractId: string | null; startsAt: string; endsAt: string; status: string; data: Record<string, string> };
export function FunctionalRecordForm({ kind, values }: { kind: FunctionalKind; values?: Values }) {
  const definition = functionalDefinition(kind), router = useRouter();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [recordKey] = useState(() => values?.key ?? `FUNCIONAL:${crypto.randomUUID()}`);
  async function submit(form: FormData) {
    setPending(true); setError("");
    try {
      const result = await saveFunctionalRecordAction({ ...(values ? { id: values.id, version: values.version } : {}), kind, key: recordKey,
        name: String(form.get("name") ?? ""), employeeId: String(form.get("employeeId") ?? ""), contractId: String(form.get("contractId") ?? ""),
        startsAt: String(form.get("startsAt") ?? ""), endsAt: String(form.get("endsAt") ?? ""), status: String(form.get("status") ?? "ATIVO"),
        data: Object.fromEntries(definition.fields.map(field => [field.name, String(form.get(`data:${field.name}`) ?? "")])) });
      if (result.error) setError(result.error);
      else { router.push(`/rh/registros-funcionais?kind=${kind}`); router.refresh(); }
    } catch { setError("Falha de comunicação ao salvar. O rascunho permanece nesta ficha."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="grid grid-cols-1 gap-4 rounded border bg-white p-4 md:grid-cols-2">
    <label>Identificação do registro<input className="block w-full rounded border p-2" name="name" defaultValue={values?.name} required maxLength={200} /></label>
    {definition.holder && <label>{definition.holder === "contract" ? "Contrato funcional" : "Servidor"}<ReferenceLookup kind={definition.holder === "contract" ? "contract" : "employee"} name={definition.holder === "contract" ? "contractId" : "employeeId"} initialValue={(definition.holder === "contract" ? values?.contractId : values?.employeeId) ?? ""} required /></label>}
    <label>Início da vigência<input className="block w-full rounded border p-2" type="date" name="startsAt" required defaultValue={values?.startsAt} /></label>
    <label>Fim da vigência<input className="block w-full rounded border p-2" type="date" name="endsAt" defaultValue={values?.endsAt} /></label>
    <label>Situação<select className="block w-full rounded border p-2" name="status" defaultValue={values?.status ?? "ATIVO"}><option value="ATIVO">Ativo</option><option value="ENCERRADO">Encerrado</option><option value="CANCELADO">Cancelado</option></select></label>
    {definition.fields.map(field => <label key={field.name}>{field.label}{field.lookup ? <ReferenceLookup kind={field.lookup} name={`data:${field.name}`} initialValue={values?.data[field.name]} required={!field.optional} /> : field.options ? <select className="block w-full rounded border p-2" name={`data:${field.name}`} required={!field.optional} defaultValue={values?.data[field.name] ?? ""}><option value="">Selecione</option>{field.options.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select> : field.type === "textarea" ? <textarea className="block w-full rounded border p-2" name={`data:${field.name}`} required={!field.optional} defaultValue={values?.data[field.name]} rows={3} /> : <input className="block w-full rounded border p-2" type={field.type ?? "text"} name={`data:${field.name}`} required={!field.optional} defaultValue={values?.data[field.name]} min={field.min} max={field.max} step={field.type === "number" ? "0.0001" : undefined} />}</label>)}
    <div className="md:col-span-2">{error && <p role="alert" className="mb-2 text-red-700">{error}</p>}<button disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white">{pending ? "Salvando…" : "Salvar registro"}</button></div>
  </form>;
}
