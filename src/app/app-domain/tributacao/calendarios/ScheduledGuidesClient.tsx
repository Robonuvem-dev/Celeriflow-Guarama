"use client";

import { useState, useTransition } from "react";
import { issueScheduledGuidesAction } from "./actions";
import type { FiscalPaymentOption } from "@/lib/tributacao/fiscal-payment-option-schema";

type Assessment = { id: string; label: string; updatedAt: string; amount: string; activeGuides: number; paymentOptions: FiscalPaymentOption[]; schedule: { number: number; amount: string; dueDate: string }[] };
export default function ScheduledGuidesClient({ assessments }: { assessments: Assessment[] }) {
  const [id, setId] = useState("");
  const [mode, setMode] = useState<"SINGLE" | "INSTALLMENT">("INSTALLMENT");
  const [optionCode, setOptionCode] = useState("");
  const [notice, setNotice] = useState("");
  const [guides, setGuides] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const row = assessments.find(row => row.id === id);
  const option = row?.paymentOptions.find(item => item.code === optionCode);
  const field = "mt-1 w-full rounded border p-2 text-xs";
  return <div className="h-full space-y-4 overflow-auto p-4">
    <h1 className="text-lg font-bold">Calendário anual · cota única e parcelas</h1>
    {notice && <p role="status" className="rounded border bg-amber-50 p-2 text-sm">{notice}</p>}
    <label className="block text-xs">Lançamento<select value={id} onChange={event => { setId(event.target.value); setOptionCode(""); setGuides([]); }} className={field}><option value="">Selecione</option>{assessments.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
    {row && <section className="space-y-3 rounded border bg-white p-3">
      <p className="text-sm">Valor líquido R$ {row.amount} · {row.activeGuides} guias vigentes</p>
      <table className="w-full text-left text-xs"><thead><tr><th>Parcela</th><th>Valor</th><th>Vencimento congelado no lançamento</th></tr></thead><tbody>{row.schedule.map(item => <tr key={item.number}><td>{item.number}</td><td>{item.amount}</td><td>{item.dueDate || "Não configurado"}</td></tr>)}</tbody></table>
      <form action={form => startTransition(async () => {
        const result = await issueScheduledGuidesAction({ assessmentId: row.id, expectedUpdatedAt: row.updatedAt, mode, singleDueDate: mode === "SINGLE" ? option?.dueDate ?? String(form.get("date") ?? "") : null, paymentOptionCode: mode === "SINGLE" && optionCode ? optionCode : undefined, reason: String(form.get("reason") ?? "") });
        if ("error" in result) { setNotice(result.error); setGuides([]); return; }
        setNotice(`${result.guideIds.length} guias emitidas.`); setGuides(result.guideIds);
      })} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Modalidade<select value={mode} onChange={event => setMode(event.target.value as "SINGLE" | "INSTALLMENT")} className={field}><option value="INSTALLMENT">Parcelas do calendário anual</option><option value="SINGLE">Cota única</option></select></label>
        {mode === "SINGLE" && <><label className="text-xs">Opção de pagamento<select value={optionCode} onChange={event => setOptionCode(event.target.value)} className={field}><option value="">Saldo integral sem desconto condicionado</option>{row.paymentOptions.map(item => <option key={item.code} value={item.code}>{item.name} · {item.discountPercent}% · {item.dueDate}</option>)}</select></label>{option ? <p className="text-xs sm:col-span-2">Prazo: {option.dueDate} · desconto: {option.discountPercent}% · condição de débitos: {({ NONE: "Sem condição", CURRENT: "Exercício", ACTIVE: "Dívida ativa", INSTALLMENT: "Parcelamentos", ALL: "Todos" })[option.debtCheck]}. {option.legalBasis}. O crédito só será reduzido após pagamento integral elegível no prazo.</p> : <label className="text-xs">Vencimento da cota única<input name="date" type="date" required className={field}/></label>}</>}
        <label className="text-xs sm:col-span-2">Fundamento<textarea name="reason" required className={field}/></label>
        <button disabled={pending || row.activeGuides > 0} className="rounded bg-emerald-700 p-2 text-xs text-white">Emitir calendário selecionado</button>
      </form>
    </section>}
    <nav className="space-y-2 text-xs">{guides.map(id => <a key={id} href={`/tributacao/guias/${id}`} target="_blank" rel="noreferrer" className="block text-emerald-700 underline">Abrir DAM {id}</a>)}</nav>
  </div>;
}
