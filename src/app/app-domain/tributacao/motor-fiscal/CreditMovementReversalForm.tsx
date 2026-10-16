"use client";

import { useState, useTransition } from "react";
import { reverseCreditMovementAction } from "../operacoes/actions";

export function CreditMovementReversalForm({ movements }: { movements: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <section className="shrink-0 rounded-md border border-slate-200 bg-white p-2.5">
    <h2 className="mb-2 text-xs font-bold text-slate-700">Reversão de compensação, transferência ou restituição</h2>
    <form className="grid gap-2 sm:grid-cols-4" action={(form) => {
      startTransition(async () => {
        const movementId = String(form.get("movementId"));
        const result = await reverseCreditMovementAction({ movementId, date: String(form.get("date")), reason: String(form.get("reason")), proofDocumentId: String(form.get("proofDocumentId") || "").trim() || undefined, idempotencyKey: `MANUAL:${movementId}` });
        setMessage(result.error ?? "Movimento revertido e crédito de origem recomposto.");
      });
    }}>
      <select aria-label="Movimento de crédito" name="movementId" required className="h-8 rounded border px-2 text-xs"><option value="">Movimento a reverter</option>{movements.map((movement) => <option key={movement.id} value={movement.id}>{movement.label}</option>)}</select>
      <input aria-label="Data da reversão" name="date" type="date" required className="h-8 rounded border px-2 text-xs" />
      <input aria-label="Fundamento da reversão" name="reason" minLength={10} maxLength={2000} placeholder="Fundamento" required className="h-8 rounded border px-2 text-xs" />
      <input aria-label="Comprovante GED do retorno dos recursos" name="proofDocumentId" placeholder="GED do retorno (restituição paga)" className="h-8 rounded border px-2 text-xs" />
      <button disabled={pending || !movements.length} className="h-8 rounded bg-slate-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Reverter movimento</button>
    </form>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </section>;
}
