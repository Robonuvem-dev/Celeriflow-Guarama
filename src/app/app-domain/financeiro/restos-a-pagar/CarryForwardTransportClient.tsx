"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transportRap, undoRapTransport } from "./actions";

type Year = { id: string; year: number; status: string; governmentEntityId: string | null };
type Payable = { id: string; label: string; governmentEntityId: string | null; registrationYear: number; status: string; transported: boolean };

export default function CarryForwardTransportClient({ payables, years }: { payables: Payable[]; years: Year[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ payableCarryForwardId: "", sourceFinancialYearId: "", targetFinancialYearId: "", reason: "", requestKey: "" });
  const selected = payables.find(payable => payable.id === form.payableCarryForwardId);
  const source = years.find(year => year.id === form.sourceFinancialYearId);
  return <section className="m-2 space-y-3 rounded border bg-white p-3"><h2 className="font-bold">Transporte anual de RAP</h2><p className="text-sm text-slate-600">Transfere apenas o saldo ainda não pago para o exercício seguinte aberto. Liquidações anteriores ficam preservadas e são herdadas por vínculo documental, sem nova despesa ou consumo do orçamento corrente.</p>{notice && <p role="status" className="rounded border bg-amber-50 p-2 text-sm">{notice}</p>}
    <form onSubmit={event => { event.preventDefault(); startTransition(async () => {
      const requestKey = form.requestKey || crypto.randomUUID();
      setForm(current => ({ ...current, requestKey }));
      const result = await transportRap({ ...form, requestKey });
      setNotice(result.error ?? `Transporte ${result.replay ? "já registrado" : "concluído"}: inscrição ${result.payableCarryForwardId}.`);
      if (!result.error) { setForm(current => ({ ...current, requestKey: "" })); router.refresh(); }
    }); }}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Inscrição<select required className="block w-full rounded border p-2" value={form.payableCarryForwardId} onChange={event => setForm({ ...form, payableCarryForwardId: event.target.value, sourceFinancialYearId: "", targetFinancialYearId: "", requestKey: "" })}><option value="">Selecione</option>{payables.filter(payable => ["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)).map(payable => <option key={payable.id} value={payable.id}>{payable.label}</option>)}</select></label>
      <label className="text-sm">Exercício de execução encerrado<select required className="block w-full rounded border p-2" value={form.sourceFinancialYearId} onChange={event => setForm({ ...form, sourceFinancialYearId: event.target.value, targetFinancialYearId: "", requestKey: "" })}><option value="">Selecione</option>{years.filter(year => selected && year.status === "Encerrado" && year.governmentEntityId === selected.governmentEntityId && year.year >= selected.registrationYear).map(year => <option key={year.id} value={year.id}>{year.year}</option>)}</select></label>
      <label className="text-sm">Destino aberto<select required className="block w-full rounded border p-2" value={form.targetFinancialYearId} onChange={event => setForm({ ...form, targetFinancialYearId: event.target.value, requestKey: "" })}><option value="">Selecione</option>{years.filter(year => source && year.year === source.year + 1 && year.status === "Aberto" && year.governmentEntityId === source.governmentEntityId).map(year => <option key={year.id} value={year.id}>{year.year}</option>)}</select></label>
      <label className="text-sm">Justificativa<input required className="block w-full rounded border p-2" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value, requestKey: "" })} /></label><button className="w-fit rounded bg-emerald-700 px-4 py-2 text-sm text-white">Transportar saldo remanescente</button>
    </fieldset></form>
    <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => {
      const result = await undoRapTransport({ payableCarryForwardId: String(data.get("payableCarryForwardId")), reason: String(data.get("reason")) });
      setNotice(result.error ?? "Transporte desmovimentado; obrigação original restaurada e histórico preservado.");
      if (!result.error) router.refresh();
    }); }}><fieldset disabled={busy} className="grid gap-3 border-t pt-3 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Desmovimentar transporte</h3><label className="text-sm">Inscrição recebida<select required name="payableCarryForwardId" className="block w-full rounded border p-2"><option value="">Selecione</option>{payables.filter(payable => payable.transported && payable.status !== "TRANSPORTE_DESMOVIMENTADO").map(payable => <option key={payable.id} value={payable.id}>{payable.label}</option>)}</select></label><label className="text-sm">Justificativa<input required name="reason" className="block w-full rounded border p-2" /></label><p className="text-xs text-slate-600 sm:col-span-2">Exige destino aberto sem competências fechadas. Pagamentos, liquidações e transportes posteriores precisam ser desfeitos primeiro.</p><button className="w-fit rounded border border-amber-700 px-4 py-2 text-sm text-amber-800">Desmovimentar transporte</button></fieldset></form>
  </section>;
}
