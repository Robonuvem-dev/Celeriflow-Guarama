"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { operationalColumns } from "../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { closeApprovedInventoryAction, recordInventoryCountAction, submitInventoryForApprovalAction } from "./actions";

type Item = {
  id: string; expectedQuantity: number; countedQuantity: number | null; divergenceType: string;
  countEvidence: string | null; adjustmentReason: string | null;
  stock: { batchNumber: string; material: { code: string; name: string; unitOfMeasure: string } };
};
type Draft = { countedQuantity: string; divergenceType: string; countEvidence: string; adjustmentReason: string };
const columns = operationalColumns([
  ["code", "Código", 110, 65, "identifier"], ["material", "Material", 240, 115], ["unit", "Unidade", 75, 55], ["batch", "Lote", 110, 65],
  ["expected", "Esperado", 95, 65, "text", "right"], ["counted", "Contado", 95, 65, "text", "right"], ["divergence", "Divergência", 150, 80],
  ["evidence", "Evidência", 180, 85], ["reason", "Justificativa", 180, 85], ["actions", "Ação", 95, 85, "actions"],
]);
const divergenceTypes = ["SEM_DIVERGENCIA", "SOBRA", "FALTA", "VENCIDO", "DANIFICADO", "LOTE_DIVERGENTE", "VALIDADE_DIVERGENTE"];

export function InventoryCountClient({ sessionId, status, items }: { sessionId: string; status: string; items: Item[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  // All drafts live above the fullscreen panel and its 20-row window.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(items.map(item => [item.id, {
    countedQuantity: item.countedQuantity == null ? "" : String(item.countedQuantity), divergenceType: item.divergenceType,
    countEvidence: item.countEvidence ?? "", adjustmentReason: item.adjustmentReason ?? "",
  }])));
  const [approvalEvidence, setApprovalEvidence] = useState("");
  const [selectedId, setSelectedId] = useState(items[0]?.id || "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = items.filter(item => !query || [item.stock.material.code, item.stock.material.name, item.stock.batchNumber].some(value => value.toLocaleLowerCase("pt-BR").includes(query)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const selected = items.find(item => item.id === selectedId);
  const editing = items.find(item => item.id === editingId);
  function change(id: string, patch: Partial<Draft>) { setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch } })); }
  function showResult(result: { error?: string; message?: string }) {
    setMessage(result.error ?? result.message);
    if (!result.error) router.refresh();
  }
  function saveCount(item: Item) {
    const draft = drafts[item.id];
    const countedQuantity = Number(draft.countedQuantity);
    if (!Number.isFinite(countedQuantity)) { setMessage("Informe uma quantidade contada válida."); return; }
    startTransition(async () => showResult(await recordInventoryCountAction({ sessionId, itemId: item.id, countedQuantity,
      divergenceType: draft.divergenceType, countEvidence: draft.countEvidence, adjustmentReason: draft.adjustmentReason })));
  }
  function editor(item: Item) {
    const draft = drafts[item.id];
    return <form onSubmit={event => { event.preventDefault(); saveCount(item); }} className="grid gap-2">
      <p>{item.stock.material.code} · {item.stock.material.name} · {item.stock.material.unitOfMeasure}</p>
      <label>Quantidade contada<input name="countedQuantity" type="number" min="0" step="any" value={draft.countedQuantity} onChange={event => change(item.id, { countedQuantity: event.target.value })} className="h-8 w-full rounded border px-2" /></label>
      <label>Divergência<select name="divergenceType" value={draft.divergenceType} onChange={event => change(item.id, { divergenceType: event.target.value })} className="h-8 w-full rounded border">{divergenceTypes.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      <label>Evidência da divergência<textarea name="countEvidence" value={draft.countEvidence} onChange={event => change(item.id, { countEvidence: event.target.value })} className="w-full rounded border p-2" rows={2} /></label>
      <label>Justificativa do ajuste<textarea name="adjustmentReason" value={draft.adjustmentReason} onChange={event => change(item.id, { adjustmentReason: event.target.value })} className="w-full rounded border p-2" rows={2} /></label>
      <button disabled={pending} className={styles.primaryButton}>Salvar contagem</button>{message && <p role="status">{message}</p>}
    </form>;
  }
  return <div className="space-y-3">
    {message && <p role="status">{message}</p>}
    <OperationalTablePanel title="Contagem e divergências" description="Consulta dos itens e rascunhos. Trocar de página ou fechar a consulta não descarta a contagem não salva.">
      <OperationalListFrame toolbar={<input type="search" aria-label="Pesquisar material ou lote" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Pesquisar material ou lote" />}
        pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="patrimonio-inventario-contagem" caption="Contagem e divergências" rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(item => {
          const draft = drafts[item.id];
          return { id: item.id, label: item.stock.material.name, values: { code: item.stock.material.code, material: item.stock.material.name, unit: item.stock.material.unitOfMeasure, batch: item.stock.batchNumber || "Sem lote", expected: String(item.expectedQuantity), counted: draft.countedQuantity || "—", divergence: draft.divergenceType.replaceAll("_", " "), evidence: draft.countEvidence || "Sem evidência adicional", reason: draft.adjustmentReason || "Sem ajuste" },
            actions: status === "COUNTING" ? <button type="button" className={styles.iconButton} aria-label={`Contar ${item.stock.material.name}`} onClick={() => setEditingId(item.id)}><Pencil /></button> : status === "CLOSED" ? "Encerrado" : "Consulta" };
        })} />
      </OperationalListFrame>
      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditingId(null); }}><DialogContent><DialogHeader><DialogTitle>Contagem do item</DialogTitle><DialogDescription>O rascunho permanece salvo em memória ao fechar e trocar de página.</DialogDescription></DialogHeader>{editing && editor(editing)}</DialogContent></Dialog>
    </OperationalTablePanel>
    {status === "COUNTING" && <><label className="grid gap-1">Material para contagem<select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="h-8 rounded border">{items.map(item => <option key={item.id} value={item.id}>{item.stock.material.code} · {item.stock.material.name} · {item.stock.batchNumber || "Sem lote"}</option>)}</select></label>{selected && editor(selected)}<button type="button" onClick={() => startTransition(async () => showResult(await submitInventoryForApprovalAction({ sessionId })))} disabled={pending} className={styles.primaryButton}>Enviar para aprovação</button></>}
    {status === "PENDING_APPROVAL" && <form onSubmit={event => { event.preventDefault(); startTransition(async () => showResult(await closeApprovedInventoryAction({ sessionId, approvalEvidence }))); }} className="grid max-w-2xl gap-2 rounded border p-3"><label>Evidência da aprovação (processo, despacho ou documento)<textarea name="approvalEvidence" required value={approvalEvidence} onChange={event => setApprovalEvidence(event.target.value)} className="w-full rounded border p-2" rows={3} /></label><button disabled={pending} className={styles.primaryButton}>Aprovar, ajustar e encerrar</button></form>}
  </div>;
}
