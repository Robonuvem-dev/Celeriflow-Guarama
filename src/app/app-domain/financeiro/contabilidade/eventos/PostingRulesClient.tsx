"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { savePostingRule } from "../actions";

type Account = { id: string; code: string; name: string };
type Component = { debitAccountId: string; creditAccountId: string; valueBasis: "EVENT_VALUE" | "PAYMENT_NET" | "PAYMENT_RETENTION"; creditFromOriginBank?: boolean };
type Rule = { eventCode: string; eventName: string; debitAccountId: string; creditAccountId: string; isReference: boolean; components: Component[] };

export default function PostingRulesClient({ accounts, events }: { accounts: Account[]; events: Rule[] }) {
  const router = useRouter();
  const empty = (): Rule => ({ eventCode: "", eventName: "", debitAccountId: accounts[0]?.id ?? "", creditAccountId: accounts[1]?.id ?? "", isReference: false, components: [] });
  const [rule, setRule] = useState<Rule>(empty);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const paymentEvent = ["PAGAMENTO_EFETIVADO", "RAP_PROCESSADO_PAGAMENTO"].includes(rule.eventCode);
  const changeComponent = (index: number, changes: Partial<Component>) => setRule(current => ({ ...current, components: current.components.map((component, position) => position === index ? { ...component, ...changes } : component) }));
  const accountOptions = accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>);

  return <div className="h-full overflow-y-auto space-y-3 p-3">
    <header><h1 className="text-lg font-bold">Eventos e matriz contábil</h1><p className="text-sm text-slate-600">Pares balanceados por evento, com bases provenientes da operação financeira.</p><Link href="/financeiro/contabilidade" className="text-sm text-emerald-800 underline">Contabilidade e fechamento</Link></header>
    {notice && <p role="status" className="rounded border bg-slate-50 p-3 text-sm">{notice}</p>}
    <form className="space-y-3 rounded border bg-white p-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setNotice("");
      try { const result = await savePostingRule(rule); setNotice(result.error ?? "Matriz contábil salva."); if (!result.error) router.refresh(); }
      catch { setNotice("Não foi possível salvar a matriz contábil."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">Evento existente<select className="block w-full rounded border p-2" value={events.some(event => event.eventCode === rule.eventCode) ? rule.eventCode : ""} onChange={event => { setRule(events.find(item => item.eventCode === event.target.value) ?? empty()); setNotice(""); }}><option value="">Novo evento</option>{events.map(event => <option key={event.eventCode} value={event.eventCode}>{event.eventCode} · {event.eventName}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Código<input required className="block w-full rounded border p-2" value={rule.eventCode} onChange={event => setRule({ ...rule, eventCode: event.target.value })} /></label><label className="text-sm">Nome<input required className="block w-full rounded border p-2" value={rule.eventName} onChange={event => setRule({ ...rule, eventName: event.target.value })} /></label></div>
        <h2 className="font-semibold">Par principal — valor do evento</h2>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Débito<select required className="block w-full rounded border p-2" value={rule.debitAccountId} onChange={event => setRule({ ...rule, debitAccountId: event.target.value })}>{accountOptions}</select></label><label className="text-sm">Crédito<select required className="block w-full rounded border p-2" value={rule.creditAccountId} onChange={event => setRule({ ...rule, creditAccountId: event.target.value })}>{accountOptions}</select></label></div>
        <h2 className="font-semibold">Pares complementares</h2>
        {rule.components.map((component, index) => <div key={index} className="space-y-2 rounded border p-3">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Débito<select required className="block w-full rounded border p-2" value={component.debitAccountId} onChange={event => changeComponent(index, { debitAccountId: event.target.value })}>{accountOptions}</select></label><label className="text-sm">Crédito<select required className="block w-full rounded border p-2" value={component.creditAccountId} onChange={event => changeComponent(index, { creditAccountId: event.target.value })}>{accountOptions}</select></label></div>
          <label className="block text-sm">Base<select className="block w-full rounded border p-2" value={component.valueBasis} onChange={event => changeComponent(index, { valueBasis: event.target.value as Component["valueBasis"] })}><option value="EVENT_VALUE">Valor do evento</option>{paymentEvent && <><option value="PAYMENT_NET">Líquido do pagamento</option><option value="PAYMENT_RETENTION">Retenções do pagamento</option></>}</select></label>
          {paymentEvent && <label className="flex gap-2 text-sm"><input type="checkbox" checked={component.creditFromOriginBank ?? false} onChange={event => changeComponent(index, { creditFromOriginBank: event.target.checked })} />Crédito na conta contábil do banco de origem</label>}
          <button type="button" className="text-sm text-red-800 underline" onClick={() => setRule({ ...rule, components: rule.components.filter((_, position) => position !== index) })}>Remover par {index + 1}</button>
        </div>)}
        <button type="button" disabled={rule.components.length >= 20} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={() => setRule({ ...rule, components: [...rule.components, { debitAccountId: accounts[0]?.id ?? "", creditAccountId: accounts[1]?.id ?? "", valueBasis: "EVENT_VALUE" }] })}>Adicionar par</button>
        <div><button disabled={busy} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar matriz"}</button></div>
      </fieldset>
    </form>
  </div>;
}
