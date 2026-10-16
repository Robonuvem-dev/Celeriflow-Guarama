"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { functionalDocumentKinds } from "@/lib/portal-servidor/publication-contract";
import { publishFunctionalDocumentAction, revokeFunctionalDocumentAction } from "./actions";

export function FunctionalPublicationForm() {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try {
      const result = await publishFunctionalDocumentAction({ employeeId: String(data.get("employeeId")), budgetUnitId: String(data.get("budgetUnitId")), contractId: String(data.get("contractId") || "") || null, kind: String(data.get("kind")), year: data.get("year") ? Number(data.get("year")) : null, documentVersionId: String(data.get("documentVersionId")), sourceReference: String(data.get("sourceReference")), releaseAt: new Date(String(data.get("releaseAt"))).toISOString() });
      if (result.error) setError(result.error); else router.refresh();
    } catch { setError("Confira os campos e a data de liberação."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid gap-3 rounded border border-slate-300 bg-white p-4 text-xs md:grid-cols-2">{[{ name: "employeeId", label: "ID do servidor", required: true }, { name: "budgetUnitId", label: "ID da unidade gestora de origem", required: true }, { name: "contractId", label: "ID do contrato" }, { name: "documentVersionId", label: "ID da versão GED válida", required: true }, { name: "sourceReference", label: "Referência à emissão/cálculo RH de origem", required: true }, { name: "year", label: "Ano de pagamento / referência", type: "number" }, { name: "releaseAt", label: "Data e hora de liberação", type: "datetime-local", required: true }].map(field => <label key={field.name} className="grid gap-1 font-semibold">{field.label}<input name={field.name} type={field.type || "text"} required={field.required} disabled={pending} className="h-8 rounded border px-2 font-normal" /></label>)}<label className="grid gap-1 font-semibold">Tipo documental<select name="kind" disabled={pending} className="h-8 rounded border px-2 font-normal">{functionalDocumentKinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>{error && <p role="alert" className="text-red-700 md:col-span-2">{error}</p>}<Button disabled={pending} className="w-fit">{pending ? "Publicando…" : "Disponibilizar versão documental"}</Button></form>;
}

export function FunctionalRevocationForm({ id }: { id: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try { const result = await revokeFunctionalDocumentAction({ id, reason: String(data.get("reason") || "") }); if (result.error) setError(result.error); else router.refresh(); }
    catch { setError("Não foi possível revogar a publicação."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-2 flex flex-wrap gap-2"><input name="reason" aria-label="Motivo da revogação" placeholder="Motivo da revogação" required minLength={5} maxLength={2000} disabled={pending} className="h-8 rounded border px-2 text-xs" /><Button disabled={pending} variant="outline" size="sm">Revogar</Button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</form>;
}
