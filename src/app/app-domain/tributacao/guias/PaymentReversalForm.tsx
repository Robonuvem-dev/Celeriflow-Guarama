"use client";

import { useState, useTransition } from "react";
import { reverseGuidePayment } from "./actions";

export function PaymentReversalForm({ payments }: { payments: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <section className="shrink-0 rounded-md border border-slate-200 bg-white p-3">
    <h2 className="mb-2 text-sm font-semibold">Estorno de arrecadação tributária</h2>
    <form className="grid gap-2 sm:grid-cols-4" action={(form) => {
      startTransition(async () => {
        const paymentId = String(form.get("paymentId"));
        const result = await reverseGuidePayment({ paymentId, date: String(form.get("date")), reason: String(form.get("reason")), idempotencyKey: `MANUAL:${paymentId}` });
        setMessage(result.error ?? "Pagamento estornado; guia, caixa, contabilidade e realizado atualizados.");
      });
    }}>
      <select aria-label="Pagamento a estornar" name="paymentId" required className="rounded border px-2 text-sm"><option value="">Pagamento confirmado</option>{payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.label}</option>)}</select>
      <input aria-label="Data de estorno" name="date" type="date" required className="rounded border px-2 text-sm" />
      <input aria-label="Fundamento do estorno" name="reason" placeholder="Fundamento do estorno" minLength={10} maxLength={2000} required className="rounded border px-2 text-sm" />
      <button disabled={pending || !payments.length} className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Estornar pagamento</button>
    </form>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>;
}
