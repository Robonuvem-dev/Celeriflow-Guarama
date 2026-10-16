"use client";

import { useState, useTransition } from "react";
import { applyTaxCreditAction } from "../operacoes/actions";

type Option = { id: string; label: string };

export function AuthorizedCompensationForm({ credits, assessments, documents }: { credits: Option[]; assessments: Option[]; documents: Option[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <details className="shrink-0 rounded-md border border-slate-200 bg-white p-2.5">
    <summary className="cursor-pointer text-xs font-bold text-slate-700">Compensação autorizada entre contribuintes</summary>
    <form className="mt-2 grid gap-2 sm:grid-cols-3" action={(form) => {
      startTransition(async () => {
        const result = await applyTaxCreditAction({ creditId: String(form.get("creditId")), assessmentId: String(form.get("assessmentId")), authorizationDocumentId: String(form.get("authorizationDocumentId")), operation: "COMPENSAR", amount: Number(form.get("amount")), reason: String(form.get("reason")), idempotencyKey: String(form.get("idempotencyKey")) });
        setMessage(result.error ?? "Compensação registrada com autorização e vínculo aos dois contribuintes.");
      });
    }}>
      <select aria-label="Crédito de origem" name="creditId" required className="h-8 rounded border px-2 text-xs"><option value="">Crédito de origem</option>{credits.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select aria-label="Débito de destino" name="assessmentId" required className="h-8 rounded border px-2 text-xs"><option value="">Débito de destino</option>{assessments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select aria-label="Autorização GED" name="authorizationDocumentId" required className="h-8 rounded border px-2 text-xs"><option value="">Autorização GED</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <input aria-label="Valor da compensação" name="amount" type="number" min="0.01" step="0.01" required placeholder="Valor" className="h-8 rounded border px-2 text-xs" />
      <input aria-label="Fundamento da compensação" name="reason" minLength={10} maxLength={2000} required placeholder="Fundamento" className="h-8 rounded border px-2 text-xs" />
      <input aria-label="Chave da compensação" name="idempotencyKey" required placeholder="Chave da operação" className="h-8 rounded border px-2 text-xs" />
      <button disabled={pending || !credits.length || !assessments.length || !documents.length} className="h-8 rounded bg-slate-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Registrar compensação</button>
    </form>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </details>;
}
