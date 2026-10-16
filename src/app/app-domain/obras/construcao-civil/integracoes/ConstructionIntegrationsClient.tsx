"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

type Receipt = { id: string; protocol: string; destination: string; submittedAt: string; evidenceHash: string };
type Batch = { id: string; period: string; version: number; hash: string; rectifiesId: string | null; createdAt: string; receipts: Receipt[] };
type RectificationOption = { id: string; period: string; version: number };

function ReceiptHistory({ batch }: { batch: Batch }) {
  const [q, setQ] = useState("");
  const [requestedPage, setPage] = useState(1);
  const receipts = batch.receipts.filter((receipt) => `${receipt.protocol} ${receipt.destination} ${receipt.evidenceHash}`.toLocaleLowerCase("pt-BR").includes(q.trim().toLocaleLowerCase("pt-BR")));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(receipts.length / 20)));
  return <div className="space-y-2">
    <h3 className="font-semibold text-sm">Recibos manuais</h3>
    <input aria-label={`Buscar recibos do lote ${batch.period} v${batch.version}`} placeholder="Buscar protocolo, destino ou hash do recibo" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-full rounded border p-2 text-sm" />
    {receipts.slice((page - 1) * 20, page * 20).map((receipt) => <div key={receipt.id} className="space-y-1 rounded border p-2 text-xs">
      <p>{receipt.protocol} · {receipt.destination} · {new Date(receipt.submittedAt).toLocaleString("pt-BR")}</p>
      <p className="break-all">SHA-256: {receipt.evidenceHash}</p>
      <a href={`/api/construcao-civil/exportacoes/${batch.id}/recibo?receiptId=${receipt.id}`} className="underline">Baixar comprovante verificado</a>
    </div>)}
    {!receipts.length && <p className="text-sm">{batch.receipts.length ? "Nenhum recibo corresponde à busca." : "Sem recibo; transmissão não registrada."}</p>}
    <ErpPagination page={page} total={receipts.length} pageSize={20} previousHref="#" nextHref="#" label="recibos" onPageChange={setPage} />
  </div>;
}

export default function ConstructionIntegrationsClient({ cases, batches, rectificationOptions }: { cases: { id: string; protocol: string }[]; batches: Batch[]; rectificationOptions: RectificationOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<string[]>([]);
  const [rectifiesId, setRectifiesId] = useState("");
  const [reason, setReason] = useState("");
  const [caseQuery, setCaseQuery] = useState("");
  const [caseFilter, setCaseFilter] = useState("all");
  const [requestedCasePage, setCasePage] = useState(1);
  const filteredCases = cases.filter((item) => item.protocol.toLocaleLowerCase("pt-BR").includes(caseQuery.trim().toLocaleLowerCase("pt-BR")) && (caseFilter !== "selected" || selected.includes(item.id)));
  const casePage = Math.min(requestedCasePage, Math.max(1, Math.ceil(filteredCases.length / 20)));

  async function send(validateOnly: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/construcao-civil/exportacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: crypto.randomUUID(), period, caseIds: selected, rectifiesId: rectifiesId || undefined, reason: reason || undefined, validateOnly }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(validateOnly ? data.validation.valid ? "Lote consistente para o leiaute municipal demonstrativo." : data.validation.issues.map((issue: { caseId: string; message: string }) => `${issue.caseId}: ${issue.message}`).join("\n") : "Lote imutável gerado.");
      if (!validateOnly) router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na integração."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <section className="rounded border p-4 space-y-3">
      <h2 className="font-semibold">Preparar lote</h2>
      <label className="block text-sm">Competência <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded border p-2" /></label>
      <label className="block text-sm">Retificação <select value={rectifiesId} onChange={(event) => { setRectifiesId(event.target.value); const batch = rectificationOptions.find((row) => row.id === event.target.value); if (batch) setPeriod(batch.period); }} className="rounded border p-2"><option value="">Novo lote</option>{rectificationOptions.map((row) => <option key={row.id} value={row.id}>{row.period} v{row.version}</option>)}</select></label>
      {rectifiesId && <label className="block text-sm">Motivo da retificação<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="block w-full rounded border p-2" /></label>}
      <fieldset className="space-y-2">
        <legend className="font-semibold text-sm">Processos — {selected.length} selecionados (até 200 por lote)</legend>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Buscar processos para o lote" placeholder="Buscar protocolo" value={caseQuery} onChange={(event) => { setCaseQuery(event.target.value); setCasePage(1); }} className="min-w-0 flex-1 rounded border p-2 text-sm" />
          <select aria-label="Filtrar seleção de processos" value={caseFilter} onChange={(event) => { setCaseFilter(event.target.value); setCasePage(1); }} className="rounded border p-2 text-sm"><option value="all">Todos os processos</option><option value="selected">Somente selecionados</option></select>
        </div>
        {filteredCases.slice((casePage - 1) * 20, casePage * 20).map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
          <label><input type="checkbox" checked={selected.includes(item.id)} disabled={busy || (!selected.includes(item.id) && selected.length >= 200)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /> {item.protocol}</label>
          <Link href={`/obras/construcao-civil/${item.id}/pranchas`} className="text-xs underline">Pranchas e zoneamento</Link>
        </div>)}
        {!filteredCases.length && <p className="text-sm">Nenhum processo corresponde aos filtros.</p>}
        <ErpPagination page={casePage} total={filteredCases.length} pageSize={20} previousHref="#" nextHref="#" label="processos disponíveis" onPageChange={setCasePage} />
      </fieldset>
      <div className="flex gap-2"><button disabled={busy} onClick={() => send(true)} className="rounded border px-3 py-2 text-sm">Validar inconsistências</button><button disabled={busy} onClick={() => send(false)} className="rounded border px-3 py-2 text-sm">Gerar lote versionado</button></div>
      {message && <p role="status" className="whitespace-pre-wrap text-sm">{message}</p>}
    </section>
    <h2 className="font-semibold">Histórico de lotes</h2>
    {batches.map((row) => <section key={row.id} className="rounded border p-4 space-y-2">
      <h3 className="font-semibold">{row.period} — v{row.version} {row.rectifiesId ? "(retificação)" : ""}</h3>
      <p className="text-sm">{new Date(row.createdAt).toLocaleString("pt-BR")}</p>
      <p className="break-all text-xs">SHA-256: {row.hash}</p>
      <a href={`/api/construcao-civil/exportacoes/${row.id}`} className="text-sm underline">Baixar bytes originais verificados</a>
      <ReceiptHistory batch={row} />
      <details><summary className="text-sm font-semibold">Registrar recibo manual</summary><form className="grid gap-2 pt-2" onSubmit={async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
        try {
          form.set("submittedAt", new Date(String(form.get("submittedAt"))).toISOString());
          const response = await fetch(`/api/construcao-civil/exportacoes/${row.id}/recibo`, { method: "POST", body: form }); const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          router.refresh(); setMessage("Recibo manual registrado.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no recibo."); }
        finally { setBusy(false); }
      }}>
        <input aria-label="Protocolo do recibo" name="protocol" placeholder="Protocolo do recibo" required className="rounded border p-2 text-sm" />
        <input aria-label="Destino do envio" name="destination" placeholder="Destino do envio manual" required className="rounded border p-2 text-sm" />
        <label className="text-sm">Data/hora do envio <input name="submittedAt" type="datetime-local" required className="rounded border p-2" /></label>
        <textarea aria-label="Observações do envio" name="notes" placeholder="Observações do envio manual (mínimo 10 caracteres)" minLength={10} required className="rounded border p-2 text-sm" />
        <label className="text-sm">Comprovante PDF/JPG/PNG <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label>
        <button disabled={busy} className="rounded border p-2 text-sm">Registrar recibo e hash da evidência</button>
      </form></details>
    </section>)}
  </div>;
}
