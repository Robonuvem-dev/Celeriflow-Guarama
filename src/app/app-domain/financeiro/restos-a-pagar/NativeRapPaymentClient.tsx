"use client";

import { useState } from "react";
import Link from "next/link";
import { issueRapPayment } from "./actions";

type Payable = { id: string; label: string; budgetUnitId: string; resourceSourceId: string | null; settlements: { id: string; label: string }[] };
type Bank = { id: string; label: string; budgetUnitId: string | null; resourceSourceIds: string[] };

export default function NativeRapPaymentClient({ payables, banks }: { payables: Payable[]; banks: Bank[] }) {
  const [form, setForm] = useState({ payableCarryForwardId: "", settlementId: "", bankAccountId: "", orderNumber: "", date: new Date().toISOString().slice(0, 10), value: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = payables.find(payable => payable.id === form.payableCarryForwardId);
  const compatibleBanks = banks.filter(bank => selected && bank.budgetUnitId === selected.budgetUnitId && selected.resourceSourceId && bank.resourceSourceIds.includes(selected.resourceSourceId));
  return <section className="m-2 space-y-3 rounded border bg-white p-3">
    <h2 className="font-bold text-slate-800">Emitir ordem de pagamento de RAP liquidado</h2>
    <p className="text-sm text-slate-600">A ordem é emitida no exercício corrente, com vínculo à inscrição e à liquidação original. A confirmação e o estorno ficam em <Link className="text-emerald-800 underline" href="/financeiro/pagamentos">Pagamentos</Link>.</p>
    {notice && <p role="status" className="rounded bg-slate-50 p-2 text-sm">{notice}</p>}
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setNotice(""); try { const result = await issueRapPayment(form); setNotice(result.error ?? "Ordem emitida. Acesse Pagamentos para efetivá-la."); } catch { setNotice("Não foi possível emitir a ordem."); } finally { setBusy(false); } }}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">RAP<select required className="block w-full rounded border p-2" value={form.payableCarryForwardId} onChange={event => setForm({ ...form, payableCarryForwardId: event.target.value, settlementId: "", bankAccountId: "" })}><option value="">Selecione a inscrição</option>{payables.map(payable => <option key={payable.id} value={payable.id}>{payable.label}</option>)}</select></label>
        <label className="text-sm">Liquidação<select required className="block w-full rounded border p-2" value={form.settlementId} onChange={event => setForm({ ...form, settlementId: event.target.value })}><option value="">Selecione a liquidação original</option>{selected?.settlements.map(settlement => <option key={settlement.id} value={settlement.id}>{settlement.label}</option>)}</select></label>
        <label className="text-sm">Conta bancária<select required className="block w-full rounded border p-2" value={form.bankAccountId} onChange={event => setForm({ ...form, bankAccountId: event.target.value })}><option value="">Selecione a conta compatível</option>{compatibleBanks.map(bank => <option key={bank.id} value={bank.id}>{bank.label}</option>)}</select></label>
        <label className="text-sm">Número da ordem<input required className="block w-full rounded border p-2" value={form.orderNumber} onChange={event => setForm({ ...form, orderNumber: event.target.value })} /></label>
        <label className="text-sm">Data<input required type="date" className="block w-full rounded border p-2" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
        <label className="text-sm">Valor bruto<input required type="number" min="0.01" step="0.01" className="block w-full rounded border p-2" value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} /></label>
        <button className="w-fit rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Emitindo…" : "Emitir ordem"}</button>
      </fieldset>
    </form>
  </section>;
}
