"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { operationalColumns } from "../../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { approveMaterialRequestAction, issueMaterialRequestInFullAction, issueMaterialRequestItemAction as issuePartialAction } from "../actions";

type RequestItem = { id: string; quantityRequested: number; quantityApproved: number; quantityDelivered: number; material: { id: string; code: string; name: string; unitOfMeasure: string } };
type Request = { id: string; number: string; status: string; items: RequestItem[] };
type Stock = { id: string; materialId: string; quantity: number; batchNumber: string; expirationLabel: string; warehouse: { name: string } };

export function MaterialRequestWorkflowClient({ request, stocks, settlements = [], canApprove, canIssue, operationMessage }: { request: Request; stocks: Stock[]; settlements?: Array<{ id: string; label: string }>; canApprove: boolean; canIssue: boolean; operationMessage?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [approvedQuantities, setApprovedQuantities] = useState(() => Object.fromEntries(request.items.map(item => [item.id, item.quantityRequested])));
  const [stockByItem, setStockByItem] = useState<Record<string, string>>(() => Object.fromEntries(request.items.map(item => [item.id, stocks.find(stock => stock.materialId === item.material.id)?.id || ""])));
  const [quantityByItem, setQuantityByItem] = useState<Record<string, number>>(() => Object.fromEntries(request.items.map(item => [item.id, Math.min(item.quantityApproved - item.quantityDelivered, stocks.find(stock => stock.materialId === item.material.id)?.quantity || 0)])));
  const [settlementByItem, setSettlementByItem] = useState<Record<string, string>>({});
  const [lotSearch, setLotSearch] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState(request.items[0]?.id || "");
  const deliveryKeys = useRef<Record<string, string>>({});
  async function issueMaterialRequestItemAction(data: Parameters<typeof issuePartialAction>[0]) {
    const key = deliveryKeys.current[data.requestItemId] ||= crypto.randomUUID();
    const result = await issuePartialAction({ ...data, idempotencyKey: key });
    if (!result.error) delete deliveryKeys.current[data.requestItemId];
    return result;
  }
  const pendingApproval = request.status === "Pendente";
  const awaitingDelivery = ["Aprovada", "Atendida Parcialmente"].includes(request.status);
  const remainingItems = request.items.filter(item => item.quantityApproved > item.quantityDelivered);

  function operate(callback: () => Promise<{ error?: string; message?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await callback();
        if (result.error) setFeedback(result.error);
        else { setFeedback(result.message || "Operação registrada."); router.refresh(); }
      } catch { setFeedback("Não foi possível confirmar a operação. Atualize e tente novamente."); }
    });
  }

  const nextStep = pendingApproval ? "Aguardando análise: aprove as quantidades ou informe zero para recusar o item." : awaitingDelivery ? "Pedido aprovado: selecione o lote e registre a entrega parcial ou integral. Cada entrega reduz o estoque e o saldo pendente." : request.status === "Atendida" ? "Entrega concluída. Consulte abaixo os movimentos e o destino dos materiais." : "Pedido encerrado sem entrega.";
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = request.items.filter(item => !query || [item.material.code, item.material.name].some(value => value.toLocaleLowerCase("pt-BR").includes(query)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const editingItem = request.items.find(item => item.id === editingItemId);
  const selectedItem = request.items.find(item => item.id === selectedItemId);
  function approval(item: RequestItem) {
    return <input aria-label={`Quantidade aprovada de ${item.material.name}`} type="number" min="0" max={item.quantityRequested} step="any" value={approvedQuantities[item.id]} onChange={event => setApprovedQuantities(current => ({ ...current, [item.id]: Number(event.target.value) }))} className="h-6 w-full min-w-0 rounded border px-1" />;
  }
  function attendance(item: RequestItem) {
    const remaining = Math.max(0, item.quantityApproved - item.quantityDelivered);
    const selected = stocks.find(stock => stock.id === stockByItem[item.id]);
    const quantity = Math.min(quantityByItem[item.id] || 0, remaining, selected?.quantity || 0);
    const available = stocks.filter(stock => stock.materialId === item.material.id && `${stock.batchNumber} ${stock.warehouse.name}`.toLowerCase().includes((lotSearch[item.id] || "").toLowerCase()));
    if (!remaining) return <p>Item concluído</p>;
    return <div className="grid gap-2">
      <p>{item.material.code} · {item.material.name} · {item.material.unitOfMeasure} · Pendente: {remaining}</p>
      <label>Pesquisar lote ou depósito<input type="search" value={lotSearch[item.id] || ""} onChange={event => setLotSearch(current => ({ ...current, [item.id]: event.target.value }))} className="h-8 w-full rounded border px-2" /></label>
      <label>Lote<select aria-label={`Lote de ${item.material.name}`} value={stockByItem[item.id]} onChange={event => { const stock = stocks.find(row => row.id === event.target.value); setStockByItem(current => ({ ...current, [item.id]: event.target.value })); setQuantityByItem(current => ({ ...current, [item.id]: Math.min(remaining, stock?.quantity || 0) })); }} className="h-8 w-full rounded border">
        <option value="">Selecione um lote</option>{selected && !available.some(stock => stock.id === selected.id) && <option value={selected.id}>{selected.warehouse.name} · {selected.batchNumber || "Sem lote"} · saldo {selected.quantity} · validade {selected.expirationLabel}</option>}{available.map(stock => <option key={stock.id} value={stock.id}>{stock.warehouse.name} · {stock.batchNumber || "Sem lote"} · saldo {stock.quantity} · validade {stock.expirationLabel}</option>)}
      </select></label>
      {!available.length && <p className="text-amber-700">Sem lote disponível na origem para este filtro.</p>}
      <label>Quantidade a entregar<Input aria-label={`Quantidade a entregar de ${item.material.name}`} type="number" min="0.000001" max={Math.min(remaining, selected?.quantity || 0)} step="any" value={quantity} onChange={event => setQuantityByItem(current => ({ ...current, [item.id]: Number(event.target.value) }))} /></label>
      {settlements.length > 0 && <label>Vínculo financeiro do consumo<select aria-label={`Liquidação de ${item.material.name}`} value={settlementByItem[item.id] || ""} onChange={event => setSettlementByItem(current => ({ ...current, [item.id]: event.target.value }))} className="h-8 w-full rounded border"><option value="">Sem vínculo financeiro de consumo</option>{settlements.map(settlement => <option key={settlement.id} value={settlement.id}>{settlement.label}</option>)}</select></label>}
      <Button type="button" size="sm" variant="outline" disabled={!canIssue || pending || !selected || !(quantity > 0)} onClick={() => operate(() => issueMaterialRequestItemAction({ requestItemId: item.id, stockId: stockByItem[item.id], quantity, ...(settlementByItem[item.id] ? { settlementId: settlementByItem[item.id] } : {}) }))}>Registrar entrega</Button>
      {feedback && <p role="status">{feedback}</p>}
    </div>;
  }
  const workflowActions = <div className="flex gap-2">
    {pendingApproval && canApprove && <Button type="button" size="sm" disabled={pending} onClick={() => operate(() => approveMaterialRequestAction(request.id, request.items.map(item => ({ itemId: item.id, quantityApproved: Number(approvedQuantities[item.id]) }))))}>{pending ? "Registrando..." : "Confirmar análise e aprovação"}</Button>}
    {awaitingDelivery && canIssue && <Button type="button" size="sm" disabled={pending || !remainingItems.length || remainingItems.some(item => { const stock = stocks.find(row => row.id === stockByItem[item.id]); return !stock || stock.quantity < item.quantityApproved - item.quantityDelivered; })} onClick={() => operate(() => issueMaterialRequestInFullAction({ requestId: request.id, stockByItem: remainingItems.map(item => ({ requestItemId: item.id, stockId: stockByItem[item.id], ...(settlementByItem[item.id] ? { settlementId: settlementByItem[item.id] } : {}) })) }))}>Entregar todo o saldo pendente</Button>}
  </div>;

  return <section className="space-y-3 rounded border bg-white p-3">
    <p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">{nextStep}</p>
    {operationMessage && <p className="text-xs text-amber-800">{operationMessage}</p>}
    <OperationalTablePanel title={`Itens da requisição ${request.number}`} description={nextStep}>
      <OperationalListFrame actions={<>{workflowActions}<OperationalFilters label="Orientações e resultado"><p>{nextStep}</p>{operationMessage && <p>{operationMessage}</p>}{feedback && <p role="status">{feedback}</p>}</OperationalFilters></>}
        toolbar={<input type="search" aria-label="Pesquisar material da requisição" placeholder="Código ou material" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />}
        pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="patrimonio-requisicao-itens" caption={`Itens da requisição ${request.number}`} columns={operationalColumns([
          ["code", "Código", 110, 65, "identifier"], ["material", "Material", 260, 120], ["unit", "Unidade", 75, 55], ["requested", "Solicitado", 95, 70, "text", "right"], ["approved", "Aprovado", 95, 75, "text", "right"], ["delivered", "Entregue", 95, 70, "text", "right"], ["remaining", "Pendente", 100, 70, "text", "right"], ["warehouse", "Origem selecionada", 170, 80], ["batch", "Lote selecionado", 130, 75], ["actions", "Atendimento", 85, 75, "actions"],
        ])} rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(item => {
          const stock = stocks.find(row => row.id === stockByItem[item.id]);
          return { id: item.id, label: item.material.name, values: { code: item.material.code, material: item.material.name, unit: item.material.unitOfMeasure, requested: String(item.quantityRequested), approved: String(pendingApproval && canApprove ? approvedQuantities[item.id] : item.quantityApproved), delivered: String(item.quantityDelivered), remaining: pendingApproval ? "Em análise" : String(Math.max(0, item.quantityApproved - item.quantityDelivered)), warehouse: awaitingDelivery ? stock?.warehouse.name || "Sem seleção" : "—", batch: awaitingDelivery ? stock?.batchNumber || "Sem lote" : "—" },
            cells: pendingApproval && canApprove ? { approved: approval(item) } : undefined,
            actions: awaitingDelivery && item.quantityApproved > item.quantityDelivered ? <button type="button" aria-label={`Atender ${item.material.name}`} className={styles.iconButton} onClick={() => setEditingItemId(item.id)}><PackageCheck /></button> : "—" };
        })} />
      </OperationalListFrame>
      <Dialog open={Boolean(editingItem)} onOpenChange={open => { if (!open) setEditingItemId(null); }}><DialogContent><DialogHeader><DialogTitle>Atendimento do item</DialogTitle><DialogDescription>Selecione lote, quantidade e vínculo financeiro. Os valores são preservados ao fechar.</DialogDescription></DialogHeader>{editingItem && attendance(editingItem)}</DialogContent></Dialog>
    </OperationalTablePanel>
    {(awaitingDelivery || (pendingApproval && canApprove)) && <div className="grid max-w-2xl gap-2"><label>Item para análise / atendimento<select value={selectedItemId} onChange={event => setSelectedItemId(event.target.value)} className="h-8 w-full rounded border">{request.items.map(item => <option key={item.id} value={item.id}>{item.material.code} · {item.material.name}</option>)}</select></label>{selectedItem && (awaitingDelivery ? attendance(selectedItem) : <label>Quantidade aprovada{approval(selectedItem)}</label>)}</div>}
    {feedback && <p role="status" className="rounded border bg-slate-50 p-2 text-xs">{feedback}</p>}
    {workflowActions}
  </section>;
}
