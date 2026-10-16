"use client";
import { useState, useTransition } from "react";
import { reservePartnerDiscountAction, postPartnerDiscountAction } from "./actions";

export function PartnerDiscountForm({ grantId, requestKey, contracts }: { grantId: string; requestKey: string; contracts: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setMessage("");
    startTransition(async () => { try { const result = await reservePartnerDiscountAction({ grantId, requestKey, contractId: String(data.get("contractId")), number: String(data.get("number")), firstCompetence: String(data.get("firstCompetence")), count: Number(data.get("count")), amount: String(data.get("amount")), reason: String(data.get("reason")) }); setMessage(result.error || "Cronograma reservado na origem RH. As parcelas devem ser lançadas nas folhas autorizadas."); } catch { setMessage("Não foi possível reservar o desconto."); } });
  }
  return <form onSubmit={submit} className="mt-3 space-y-2 text-xs"><fieldset disabled={pending} className="grid gap-2 sm:grid-cols-2"><label className="flex flex-col gap-1">Contrato autorizado<select name="contractId" required className="rounded border p-2">{contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.label}</option>)}</select></label>{[["number", "Número do contrato", "text"], ["firstCompetence", "Primeira competência (MM/AAAA)", "text"], ["count", "Quantidade de parcelas", "number"], ["amount", "Valor da parcela (BRL, ponto decimal)", "text"], ["reason", "Fundamento/referência", "text"]].map(([name, label, type]) => <label key={name} className="flex flex-col gap-1">{label}<input name={name} type={type} required className="rounded border p-2" /></label>)}<button className="rounded bg-emerald-800 px-4 py-2 font-semibold text-white sm:col-span-2">{pending ? "Registrando…" : "Reservar cronograma de descontos"}</button></fieldset>{message && <p role="status">{message}</p>}</form>;
}
export function PartnerInstallmentForm({ grantId, installmentId, payrollIds }: { grantId: string; installmentId: string; payrollIds: string[] }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => { try { const result = await postPartnerDiscountAction({ grantId, installmentId, payrollId: String(data.get("payrollId")) }); setError(result.error); } catch { setError("Não foi possível lançar a parcela."); } });
  }
  return <form onSubmit={submit}><fieldset disabled={pending} className="flex gap-2"><select name="payrollId" aria-label="Folha autorizada" required className="min-w-0 rounded border p-1">{payrollIds.map(id => <option key={id}>{id}</option>)}</select><button className="rounded border px-2">{pending ? "Lançando…" : "Lançar parcela"}</button></fieldset>{error && <p role="alert" className="text-red-700">{error}</p>}</form>;
}
