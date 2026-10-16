"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { liquidateRap, cancelRapSettlement } from "./actions";

type Payable = { id: string; label: string; settlements: { id: string; label: string }[] };
export default function NativeRapSettlementClient({ payables, documents, authors }: { payables: Payable[]; documents: { id: string; title: string }[]; authors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ payableCarryForwardId: "", date: new Date().toISOString().slice(0, 10), value: "", documentId: "", authorId: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = payables.find(payable => payable.id === form.payableCarryForwardId);
  return <section className="m-2 space-y-3 rounded border bg-white p-3"><h2 className="font-bold">Liquidar RAP não processado</h2><p className="text-sm text-slate-600">A liquidação fica no exercício corrente e vinculada à inscrição original. Após o ateste, emita a ordem de pagamento abaixo.</p>{notice && <p role="status" className="rounded bg-slate-50 p-2 text-sm">{notice}</p>}
    <form onSubmit={async event => { event.preventDefault(); setBusy(true); try { const result = await liquidateRap(form); setNotice(result.error ?? "Liquidação registrada no exercício corrente."); if (!result.error) { setForm({ ...form, value: "" }); router.refresh(); } } catch { setNotice("Não foi possível liquidar o RAP."); } finally { setBusy(false); } }}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Inscrição<select required value={form.payableCarryForwardId} onChange={event => setForm({ ...form, payableCarryForwardId: event.target.value })} className="block w-full rounded border p-2"><option value="">Selecione o RAP não processado</option>{payables.map(payable => <option key={payable.id} value={payable.id}>{payable.label}</option>)}</select></label><label className="text-sm">Data<input required type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} className="block w-full rounded border p-2" /></label><label className="text-sm">Valor bruto<input required type="number" min="0.01" step="0.01" value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} className="block w-full rounded border p-2" /></label><label className="text-sm">Comprovante GED<select required value={form.documentId} onChange={event => setForm({ ...form, documentId: event.target.value })} className="block w-full rounded border p-2"><option value="">Selecione o documento válido</option>{documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label className="text-sm">Responsável pelo ateste<select required value={form.authorId} onChange={event => setForm({ ...form, authorId: event.target.value })} className="block w-full rounded border p-2"><option value="">Selecione o servidor ativo</option>{authors.map(author => <option key={author.id} value={author.id}>{author.name}</option>)}</select></label><button className="w-fit rounded bg-emerald-700 px-4 py-2 text-sm text-white">{busy ? "Liquidando…" : "Registrar liquidação"}</button></fieldset>
    </form>
    {selected?.settlements.map(settlement => <div key={settlement.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>{settlement.label}</span><button disabled={busy} className="text-red-700 underline" onClick={async () => { setBusy(true); try { const result = await cancelRapSettlement(settlement.id); setNotice(result.error ?? "Liquidação cancelada com estorno das partidas."); if (!result.error) router.refresh(); } catch { setNotice("Não foi possível cancelar a liquidação."); } finally { setBusy(false); } }}>Cancelar liquidação</button></div>)}
  </section>;
}
