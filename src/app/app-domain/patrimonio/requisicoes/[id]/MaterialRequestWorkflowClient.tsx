"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const deliveryKeys = useRef<Record<string, string>>({});
  async function issueMaterialRequestItemAction(data: Parameters<typeof issuePartialAction>[0]) {
    const key = deliveryKeys.current[data.requestItemId] ||= crypto.randomUUID();
    return issuePartialAction({ ...data, idempotencyKey: key });
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

  return <section className="space-y-3 rounded border bg-white p-3">
    <p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">{nextStep}</p>
    {operationMessage && <p className="text-xs text-amber-800">{operationMessage}</p>}
    <div className="overflow-x-auto rounded border">
      <table className="w-full min-w-[850px] text-left text-xs">
        <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr><th className="p-2">Material</th><th className="p-2">Solicitado</th><th className="p-2">Aprovado</th><th className="p-2">Entregue</th><th className="p-2">Pendente</th>{awaitingDelivery && <th className="p-2">Atendimento</th>}</tr></thead>
        <tbody>{request.items.map(item => {
          const remaining = Math.max(0, item.quantityApproved - item.quantityDelivered);
          const selected = stocks.find(stock => stock.id === stockByItem[item.id]);
          const available = stocks.filter(stock => stock.materialId === item.material.id && `${stock.batchNumber} ${stock.warehouse.name}`.toLowerCase().includes((lotSearch[item.id] || "").toLowerCase()));
          return <tr key={item.id} className="border-t align-top">
            <td className="p-2 font-medium">{item.material.code}<span className="block text-slate-700">{item.material.name}</span><span className="text-slate-500">{item.material.unitOfMeasure}</span></td>
            <td className="p-2 tabular-nums">{item.quantityRequested}</td>
            <td className="p-2">{pendingApproval && canApprove ? <Input aria-label={`Quantidade aprovada de ${item.material.name}`} type="number" min="0" max={item.quantityRequested} step="any" value={approvedQuantities[item.id]} onChange={event => setApprovedQuantities(current => ({ ...current, [item.id]: Number(event.target.value) }))} className="h-8 w-20 text-xs" /> : item.quantityApproved}</td>
            <td className="p-2 tabular-nums">{item.quantityDelivered}</td><td className="p-2 font-semibold tabular-nums">{pendingApproval ? "Em análise" : remaining}</td>
            {awaitingDelivery && <td className="min-w-72 space-y-2 p-2">{remaining > 0 ? <>
              <input aria-label={`Pesquisar lote de ${item.material.name}`} type="search" placeholder="Pesquisar lote ou depósito" value={lotSearch[item.id] || ""} onChange={event => setLotSearch(current => ({ ...current, [item.id]: event.target.value }))} className="h-7 w-full rounded border px-2 text-xs" />
              <div className="max-h-28 overflow-y-auto rounded border">{available.length ? available.map(stock => <label key={stock.id} className="flex items-start gap-2 border-b p-2 text-[11px] last:border-0"><input type="radio" name={`lot-${item.id}`} checked={stockByItem[item.id] === stock.id} onChange={() => { setStockByItem(current => ({ ...current, [item.id]: stock.id })); setQuantityByItem(current => ({ ...current, [item.id]: Math.min(remaining, stock.quantity) })); }} /><span>{stock.warehouse.name} · {stock.batchNumber || "Sem lote"}<span className="block text-slate-500">Saldo {stock.quantity} · validade {stock.expirationLabel}</span></span></label>) : <p className="p-2 text-[11px] text-amber-700">Sem lote disponível na origem para este filtro.</p>}</div>
              <div className="flex items-center gap-2"><Input aria-label={`Quantidade a entregar de ${item.material.name}`} type="number" min="0.000001" max={Math.min(remaining, selected?.quantity || 0)} step="any" value={quantityByItem[item.id] || 0} onChange={event => setQuantityByItem(current => ({ ...current, [item.id]: Number(event.target.value) }))} className="h-7 w-24 text-xs" /><Button type="button" size="sm" variant="outline" disabled={!canIssue || pending || !selected || !(quantityByItem[item.id] > 0)} onClick={() => operate(() => issueMaterialRequestItemAction({ requestItemId: item.id, stockId: stockByItem[item.id], quantity: quantityByItem[item.id], ...(settlementByItem[item.id] ? { settlementId: settlementByItem[item.id] } : {}) }))}>Registrar entrega</Button></div>
              {settlements.length > 0 && <details><summary className="cursor-pointer text-[11px] text-slate-500">Vínculo financeiro do consumo</summary><select aria-label={`Liquidação de ${item.material.name}`} value={settlementByItem[item.id] || ""} onChange={event => setSettlementByItem(current => ({ ...current, [item.id]: event.target.value }))} className="mt-1 h-8 w-full rounded border text-xs"><option value="">Sem vínculo financeiro de consumo</option>{settlements.map(settlement => <option key={settlement.id} value={settlement.id}>{settlement.label}</option>)}</select></details>}
            </> : "Item concluído"}</td>}
          </tr>;
        })}</tbody>
      </table>
    </div>
    {feedback && <p role="status" className="rounded border bg-slate-50 p-2 text-xs">{feedback}</p>}
    <div className="flex gap-2">
      {pendingApproval && canApprove && <Button type="button" size="sm" disabled={pending} onClick={() => operate(() => approveMaterialRequestAction(request.id, request.items.map(item => ({ itemId: item.id, quantityApproved: Number(approvedQuantities[item.id]) }))))}>{pending ? "Registrando..." : "Confirmar análise e aprovação"}</Button>}
      {awaitingDelivery && canIssue && <Button type="button" size="sm" disabled={pending || !remainingItems.length || remainingItems.some(item => { const stock = stocks.find(row => row.id === stockByItem[item.id]); return !stock || stock.quantity < item.quantityApproved - item.quantityDelivered; })} onClick={() => operate(() => issueMaterialRequestInFullAction({ requestId: request.id, stockByItem: remainingItems.map(item => ({ requestItemId: item.id, stockId: stockByItem[item.id], ...(settlementByItem[item.id] ? { settlementId: settlementByItem[item.id] } : {}) })) }))}>Entregar todo o saldo pendente</Button>}
    </div>
  </section>;
}
