"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { FormField } from "../../educacao/S1ActionForm";
import { ReferenceLookup } from "../operacoes/ReferenceLookup";
import { savePersonnelReference } from "./actions";
import { personnelDisplayText } from "@/lib/rh/personnel-presentation";

export function ReferenceEditor({ title, fields }: { title: string; fields: Array<FormField & { lookupKind?: string }> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const displayValue = (value?: string) => value ? personnelDisplayText(value) || "Registro funcional municipal" : value;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Presentation aliases must not rewrite source keys or origin notes on an
    // otherwise unchanged save. Explicit edits retain the entered value.
    for (const field of fields) if (!field.lookupKind && field.type !== "hidden" && field.type !== "select" && field.defaultValue !== undefined && data.get(field.name) === displayValue(field.defaultValue)) data.set(field.name, field.defaultValue);
    startTransition(async () => {
      try {
        const result = await savePersonnelReference(data);
        setMessage(result.error ?? result.message ?? "Cadastro salvo.");
        if (!result.error) router.refresh();
      } catch { setMessage("Falha de comunicação; os campos preenchidos foram preservados."); }
    });
  }
  return <details className="shrink-0 rounded border bg-white">
    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{personnelDisplayText(title)}</summary>
    <form onSubmit={submit} className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(field => field.type === "hidden" ? <input key={field.name} type="hidden" name={field.name} value={field.defaultValue ?? ""} /> : <label key={field.name} className="text-xs">
        {field.label}
        {field.lookupKind ? <ReferenceLookup name={field.name} kind={field.lookupKind} initialValue={field.defaultValue} required={field.required} /> : field.type === "select" ?
          <select name={field.name} required={field.required} defaultValue={field.defaultValue ?? ""} className="mt-1 block h-8 w-full rounded border px-2"><option value="">Selecione</option>{field.options?.map(option => <option key={option.value} value={option.value}>{personnelDisplayText(option.label)}</option>)}</select> : field.type === "textarea" ?
          <textarea name={field.name} required={field.required} defaultValue={displayValue(field.defaultValue)} className="mt-1 block w-full rounded border p-2" /> :
          <input name={field.name} type={field.type ?? "text"} required={field.required} defaultValue={displayValue(field.defaultValue)} className="mt-1 block h-8 w-full rounded border px-2" />}
      </label>)}
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3"><button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-xs text-white">{pending ? "Salvando…" : "Salvar cadastro"}</button><span role="status" className="text-xs">{message}</span></div>
    </form>
  </details>;
}
