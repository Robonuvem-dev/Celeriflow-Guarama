"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { executeWorkforceOperation } from "./actions";
import { ReferenceLookup } from "./ReferenceLookup";
import type { ContractCustomFieldsPolicy, ContractCustomFieldValues } from "@/lib/rh/contract-custom-fields";
import { ContractCustomFieldsTable } from "./ContractCustomFieldsTable";

export type OperationField = { name: string; label: string; value?: string; type?: string; required?: boolean; options?: { value: string; label: string }[] };

export function OperationForm({ command, fields, title, customPolicies = {}, customValues = {} }: { command: string; fields: OperationField[]; title: string; customPolicies?: Record<string, { policy: ContractCustomFieldsPolicy; hash: string }>; customValues?: ContractCustomFieldValues }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const [regimeId, setRegimeId] = useState(fields.find(field => field.name === "regimeId")?.value || "");
  const custom = customPolicies[regimeId];
  async function submit(data: FormData) {
    const missing = custom?.policy.fields.find(field => field.required && !String(data.get(`custom:${field.code}`) || "").trim());
    if (missing) { setMessage(`Campo configurável obrigatório: ${missing.label}.`); return; }
    setPending(true);
    try {
      const result = await executeWorkforceOperation(command, Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
      setMessage(result.error || `${result.message} ${result.id || ""}`);
      if (!result.error) router.refresh();
    } catch { setMessage("Falha de comunicação. Reabra a ficha antes de repetir."); }
    finally { setPending(false); }
  }
  return <details className="shrink-0 rounded border bg-white p-2"><summary className="cursor-pointer text-sm font-semibold">{title}</summary>
    <form action={submit} className="mt-2 grid gap-2 sm:grid-cols-3">
      {fields.map(field => field.type === "hidden" ? <input key={field.name} type="hidden" name={field.name} value={field.value || ""} /> : <label key={field.name} className="text-xs">{field.label}
        {field.type === "contracts" ? <ReferenceLookup name={field.name} kind="contract" multiple required={field.required} /> : field.type?.startsWith("lookup:") ? <ReferenceLookup name={field.name} kind={field.type.slice(7)} initialValue={field.value} required={field.required} /> : field.options ? <select name={field.name} defaultValue={field.value} onChange={field.name === "regimeId" ? event => setRegimeId(event.target.value) : undefined} required={field.required} className="mt-1 block h-8 w-full rounded border px-2">{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} defaultValue={field.value} required={field.required} className="mt-1 block w-full rounded border p-2" /> : <input name={field.name} type={field.type || "text"} defaultValue={field.value} required={field.required} step={field.type === "number" ? "0.01" : undefined} className="mt-1 block h-8 w-full rounded border px-2" />}
      </label>)}
      {custom && <ContractCustomFieldsTable key={`${regimeId}:${custom.hash}`} policy={custom.policy} hash={custom.hash} initialValues={customValues} />}
      <button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-xs text-white">{pending ? "Registrando…" : title}</button>
      {message && <p role="status" className="sm:col-span-3 text-xs">{message}</p>}
    </form>
  </details>;
}
