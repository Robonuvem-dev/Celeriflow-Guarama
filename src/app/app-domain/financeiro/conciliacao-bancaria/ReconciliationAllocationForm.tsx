"use client";

import { useEffect, useState, useTransition } from "react";
import { allocateReconciliationAction, getReconciliationPositionAction, reopenReconciliationSessionAction, reverseReconciliationAllocationAction } from "./actions";

type Position = NonNullable<Awaited<ReturnType<typeof getReconciliationPositionAction>>["data"]>;
type Row = { statementItemId: string; treasuryMovementId: string; amount: string };
const emptyRow = (): Row => ({ statementItemId: "", treasuryMovementId: "", amount: "" });

export function ReconciliationAllocationForm({ sessionId, closed, onChanged }: { sessionId: string; closed: boolean; onChanged: () => Promise<void> }) {
  const [position, setPosition] = useState<Position>();
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    void getReconciliationPositionAction(sessionId).then((result) => { if (active) { setPosition(result.data); setMessage(result.error ?? ""); } });
    return () => { active = false; };
  }, [sessionId, closed]);
  const reload = async () => {
    const result = await getReconciliationPositionAction(sessionId);
    setPosition(result.data);
    await onChanged();
  };
  const field = "h-8 rounded border px-2 text-xs";
  return <section className="rounded-md border border-slate-200 bg-white p-3">
    <h3 className="text-sm font-bold">Alocações parciais e N:N</h3>
    <p className="mt-1 text-xs text-slate-600">Distribua o valor entre lançamentos. O saldo de cada origem é reservado atomicamente; movimentos pendentes anteriores podem ser conciliados neste período.</p>
    <form className="mt-2 space-y-2" action={() => startTransition(async () => {
      const result = await allocateReconciliationAction({ sessionId, reason, idempotencyKey: key, allocations: rows });
      setMessage(result.error ?? "Alocações registradas.");
      if (!result.error) { setRows([emptyRow()]); setKey(""); await reload(); }
    })}>
      {rows.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-4">
        <select aria-label={`Extrato ${index + 1}`} required disabled={closed} className={field} value={row.statementItemId} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, statementItemId: event.target.value } : item))}><option value="">Item de extrato e saldo</option>{position?.bank.filter((item) => Number(item.remaining) > 0).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.remaining}</option>)}</select>
        <select aria-label={`Tesouraria ${index + 1}`} required disabled={closed} className={field} value={row.treasuryMovementId} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, treasuryMovementId: event.target.value } : item))}><option value="">Movimento e saldo</option>{position?.treasury.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.remaining}</option>)}</select>
        <input aria-label={`Valor ${index + 1}`} required disabled={closed} type="number" min="0.01" step="0.01" placeholder="Valor alocado" className={field} value={row.amount} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} />
        <button type="button" disabled={closed || pending || rows.length === 1} className="rounded border px-2 text-xs disabled:opacity-50" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remover linha</button>
      </div>)}
      <div className="grid gap-2 sm:grid-cols-3">
        <input aria-label="Fundamento da alocação ou desfazimento" required minLength={10} maxLength={2000} className={field} placeholder="Fundamento da decisão" value={reason} onChange={(event) => setReason(event.target.value)} />
        <input aria-label="Chave da alocação" required disabled={closed} className={field} placeholder="Chave única do lote" value={key} onChange={(event) => setKey(event.target.value)} />
        <div className="flex gap-2"><button type="button" disabled={closed || pending || rows.length >= 1000} className="rounded border px-2 text-xs" onClick={() => setRows([...rows, emptyRow()])}>Adicionar linha</button><button disabled={closed || pending} className="rounded bg-slate-700 px-2 text-xs text-white disabled:opacity-50">Alocar lote</button></div>
      </div>
    </form>
    {closed && <button className="mt-2 rounded border px-2 py-1 text-xs" disabled={pending || reason.trim().length < 10} onClick={() => startTransition(async () => {
      const result = await reopenReconciliationSessionAction({ sessionId, reason });
      setMessage(result.error ?? "Sessão reaberta com histórico preservado.");
      if (!result.error) await reload();
    })}>Reabrir sessão com fundamento</button>}
    <ul className="mt-2 space-y-1 text-xs">{position?.groups.map((group) => <li key={group.id} className="flex items-center justify-between gap-2"><span>{group.reason} · {group.total} · {group.status}</span>{group.status === "EFETIVADO" && <button disabled={closed || pending || reason.trim().length < 10} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => startTransition(async () => {
      const result = await reverseReconciliationAllocationAction({ groupId: group.id, reason });
      setMessage(result.error ?? "Alocações desfeitas; saldos recompostos.");
      if (!result.error) await reload();
    })}>Desfazer lote</button>}</li>)}</ul>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </section>;
}
