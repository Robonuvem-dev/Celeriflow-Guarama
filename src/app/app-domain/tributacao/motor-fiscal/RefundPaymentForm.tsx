"use client";

import { useState, useTransition } from "react";
import { executeRefundAction } from "../operacoes/actions";

export function RefundPaymentForm({ refunds, bankAccounts, documents }: {
  refunds: { id: string; title: string; status: string }[];
  bankAccounts: { id: string; label: string }[];
  documents: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const available = refunds.filter((refund) => refund.status === "APROVADA_AGUARDANDO_TESOURARIA");
  return <section className="shrink-0 rounded-md border border-slate-200 bg-white p-2.5">
    <h2 className="mb-2 text-xs font-bold text-slate-700">Pagamento de restituição aprovada</h2>
    <form className="grid gap-2 sm:grid-cols-3" action={(form) => {
      startTransition(async () => {
        const result = await executeRefundAction({ requestId: String(form.get("requestId")), date: String(form.get("date")), bankAccountId: String(form.get("bankAccountId")), proofDocumentId: String(form.get("proofDocumentId")), idempotencyKey: String(form.get("idempotencyKey")) });
        setMessage(result.error ?? "Restituição paga e conciliada com tesouraria e contabilidade.");
      });
    }}>
      <select aria-label="Restituição aprovada" name="requestId" required className="h-8 rounded border px-2 text-xs"><option value="">Restituição aprovada</option>{available.map((refund) => <option key={refund.id} value={refund.id}>{refund.title}</option>)}</select>
      <select aria-label="Conta de pagamento da restituição" name="bankAccountId" required className="h-8 rounded border px-2 text-xs"><option value="">Conta de pagamento</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select>
      <select aria-label="Comprovante GED" name="proofDocumentId" required className="h-8 rounded border px-2 text-xs"><option value="">Comprovante GED</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select>
      <input aria-label="Data de pagamento" name="date" type="date" required className="h-8 rounded border px-2 text-xs" />
      <input aria-label="Chave de restituição" name="idempotencyKey" placeholder="Chave da operação" required className="h-8 rounded border px-2 text-xs" />
      <button disabled={pending || !available.length} className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Pagar restituição</button>
    </form>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </section>;
}
