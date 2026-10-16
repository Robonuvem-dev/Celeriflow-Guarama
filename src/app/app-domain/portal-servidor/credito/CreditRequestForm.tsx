"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitMyCreditRequest } from "../solicitacoes-rh/actions";

export type CreditReference = { id: string; ruleId: string; label: string; contracts: { id: string; label: string }[]; suppliers: { id: string; label: string }[] };

export function CreditRequestForm({ requestKey, references }: { requestKey: string; references: CreditReference[] }) {
  const [selected, setSelected] = useState(references[0]?.id || "");
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  const reference = references.find(row => row.id === selected);
  async function submit(data: FormData) {
    setPending(true);
    try {
      const result = await submitMyCreditRequest(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
      setMessage(result.error || `Pedido registrado: ${result.id}`);
      if (!result.error) router.push("/portal-servidor/solicitacoes-rh");
    } catch { setMessage("Falha de comunicação. Consulte suas solicitações antes de repetir."); }
    finally { setPending(false); }
  }
  if (!reference) return <p className="p-3 text-sm">Nenhuma folha mensal publicada com política de consignação disponível.</p>;
  return <form action={submit} className="grid gap-3 rounded border bg-white p-3 text-xs">
    <input name="requestKey" type="hidden" value={requestKey} /><input name="ruleId" type="hidden" value={reference.ruleId} />
    <label>Folha de referência<select name="sourceRunId" value={selected} onChange={event => setSelected(event.target.value)} className="ml-2 rounded border p-2">{references.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
    <div key={selected} className="grid gap-3">
      <label>Vínculo<select name="contractId" required className="ml-2 rounded border p-2">{reference.contracts.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <label>Consignatária<select name="supplierId" required className="ml-2 rounded border p-2">{reference.suppliers.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
    </div>
    <label>Primeira competência (MM/AAAA)<input name="firstCompetence" required pattern="[0-9]{2}/[0-9]{4}" placeholder="03/2027" className="ml-2 rounded border p-2" /></label>
    <label>Quantidade de parcelas<input name="count" type="number" min={1} max={120} required className="ml-2 rounded border p-2" /></label>
    <label>Valor de cada parcela em BRL<input name="amount" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="100.00" required className="ml-2 rounded border p-2" /></label>
    <label>Descrição e autorização do pedido<textarea name="description" required minLength={10} maxLength={4000} className="mt-1 block w-full rounded border p-2" /></label>
    <p>O pedido não reserva margem. O deferimento pelo RH reserva as parcelas após nova conferência. Contratação e liberação de crédito pela instituição financeira têm procedimentos próprios.</p>
    <button disabled={pending} className="w-fit rounded bg-blue-700 px-3 py-2 text-white">{pending ? "Enviando…" : "Solicitar crédito ao RH"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
