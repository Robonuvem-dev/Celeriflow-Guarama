"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBankResourceSources } from "./actions";
import FinanceTablePanel from "../FinanceTablePanel";
import { financeColumn } from "../operational-columns";

type Account = { id: string; label: string; sourceIds: string[]; undocumented: boolean; balances: { sourceId: string; balance: string }[] };
type Source = { id: string; code: string; name: string };

export default function BankResourceSourcesClient({ accounts, sources }: { accounts: Account[]; sources: Source[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [selected, setSelected] = useState(accounts[0]?.sourceIds ?? []);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const account = accounts.find(account => account.id === accountId);
  return <section className="space-y-3 p-2 text-sm">
    <label className="block">Conta bancária<select value={accountId} onChange={event => { setAccountId(event.target.value); setSelected(accounts.find(account => account.id === event.target.value)?.sourceIds ?? []); setNotice(""); }} className="block w-full rounded border p-2">{accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>
    {notice && <p role="status" className="rounded border p-2">{notice}</p>}
    {account?.undocumented && <p className="rounded bg-amber-50 p-2 text-amber-900">Há movimentos históricos sem fonte documental. Os saldos segregados precisam de conciliação antes de ativar múltiplas fontes.</p>}
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); setNotice(""); try { const result = await saveBankResourceSources(accountId, selected); setNotice(result.error ?? "Fontes permitidas atualizadas."); if (!result.error) router.refresh(); } catch { setNotice("Não foi possível atualizar as fontes."); } finally { setBusy(false); } }}>
      <fieldset disabled={busy || !account} className="space-y-3">
        <legend className="font-semibold">Fontes permitidas na conta</legend>
        <div className="max-h-56 overflow-y-auto rounded border p-2">{sources.map(source => <label key={source.id} className="flex gap-2 py-1"><input type="checkbox" checked={selected.includes(source.id)} onChange={event => setSelected(event.target.checked ? [...selected, source.id] : selected.filter(id => id !== source.id))} />{source.code} · {source.name}</label>)}</div>
        <button className="rounded bg-emerald-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Salvando…" : "Salvar fontes permitidas"}</button>
      </fieldset>
    </form>
    {!account?.undocumented && <FinanceTablePanel label="Disponibilidade bancária por fonte" preferenceId="financeiro-banco-fontes" resetKey={accountId} description={account?.label}
      columns={[financeColumn("source", "Fonte", 90, 260), financeColumn("balance", "Saldo (R$)", 90, 160, "text", "right")]}
      rows={(account?.balances ?? []).map(row => ({ id: row.sourceId, label: sources.find(source => source.id === row.sourceId)?.code ?? row.sourceId, values: { source: sources.find(source => source.id === row.sourceId)?.code ?? row.sourceId, balance: row.balance } }))} />}
  </section>;
}
