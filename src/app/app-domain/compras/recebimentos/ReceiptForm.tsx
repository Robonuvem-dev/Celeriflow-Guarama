"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePurchaseReceiptAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SourceItem = { id: string; quantity: number; receivedQuantity?: number; estimatedUnitValue: number | null; material: { id: string; code?: string; unitOfMeasure?: string; name: string; type: string } | null };
type Contract = { id: string; number: string; process: { items: SourceItem[] } };
type Option = { id: string; name: string };
type DocumentOption = { id: string; title: string };
type ReceiptItemState = { purchaseProcessItemId: string; materialId: string; warehouseId: string; quantity: number; unitCost: number; batchNumber: string; expirationDate: string; brand: string; model: string; serialNumber: string };
const pendingPhysical = (items: SourceItem[]) => items.filter(item => item.material && item.quantity > (item.receivedQuantity || 0));
const selectClass = "h-9 w-full rounded border bg-white px-2 text-sm";

export function ReceiptForm({ contracts, documents, employees, warehouses }: { contracts: Contract[]; documents: DocumentOption[]; employees: Option[]; warehouses: Option[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [contractId, setContractId] = useState("");
  const [data, setData] = useState({ number: "", receivedAt: new Date().toISOString().slice(0, 10), documentId: "", receiverId: "", attesterId: "" });
  const contract = contracts.find(item => item.id === contractId);
  const processItems = pendingPhysical(contract?.process.items || []);
  const [items, setItems] = useState<ReceiptItemState[]>([]);

  function selectContract(id: string) {
    setContractId(id);
    setItems(pendingPhysical(contracts.find(item => item.id === id)?.process.items || []).map(item => ({ purchaseProcessItemId: item.id, materialId: item.material!.id, warehouseId: "", quantity: item.quantity - (item.receivedQuantity || 0), unitCost: item.estimatedUnitValue || 0, batchNumber: "", expirationDate: "", brand: "", model: "", serialNumber: "" })));
  }

  function updateItem(index: number, values: Partial<ReceiptItemState>) {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setFeedback("");
    if (!items.some(item => item.quantity > 0)) { setFeedback("Informe ao menos uma quantidade recebida."); return; }
    if (items.some((item, index) => item.quantity > 0 && processItems[index]?.material?.type === "PATRIMONIO" && (!Number.isInteger(item.quantity) || item.serialNumber.trim() && item.quantity !== 1))) { setFeedback("Equipamentos exigem quantidade inteira. Para informar série, receba uma unidade por linha."); return; }
    setPending(true);
    try {
      const result = await approvePurchaseReceiptAction({
        number: data.number, receivedAt: new Date(`${data.receivedAt}T12:00:00.000Z`), contractId, documentId: data.documentId, receiverId: data.receiverId, attesterId: data.attesterId, idempotencyKey: `UI:${contractId}:${data.number}`,
        items: items.filter(item => item.quantity > 0).map(item => ({ purchaseProcessItemId: item.purchaseProcessItemId, materialId: item.materialId, warehouseId: item.warehouseId, quantity: item.quantity, unitCost: item.unitCost, batchNumber: item.batchNumber || undefined, expirationDate: item.expirationDate ? new Date(`${item.expirationDate}T12:00:00.000Z`) : undefined, brand: item.brand || undefined, model: item.model || undefined, serialNumber: item.serialNumber || undefined })),
      });
      if (result.error) { setFeedback(result.error); return; }
      setItems([]); setContractId(""); router.refresh();
    } catch { setFeedback("Não foi possível confirmar o recebimento. Tente novamente com o mesmo número."); }
    finally { setPending(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-xs text-slate-600">Materiais e equipamentos recebidos entram automaticamente no estoque com o código do catálogo. Serviços são atestados nas medições do contrato e não geram estoque. Quantidade zero deixa o item para uma próxima entrega.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1 text-sm">Número do recebimento<Input required value={data.number} onChange={event => setData({ ...data, number: event.target.value })} placeholder="REC-001/2026" /></label>
      <label className="grid gap-1 text-sm">Data do recebimento<Input required type="date" value={data.receivedAt} onChange={event => setData({ ...data, receivedAt: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Contrato vigente<select required value={contractId} onChange={event => selectContract(event.target.value)} className={selectClass}><option value="">Selecione o contrato</option>{contracts.map(item => <option key={item.id} value={item.id}>{item.number}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Documento GED válido<select required value={data.documentId} onChange={event => setData({ ...data, documentId: event.target.value })} className={selectClass}><option value="">Selecione o documento</option>{documents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {([['receiverId', 'Recebedor'], ['attesterId', 'Atestador']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}<select required value={data[key]} onChange={event => setData({ ...data, [key]: event.target.value })} className={selectClass}><option value="">Selecione o servidor</option>{employees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
    </div>
    {contract && !items.length && <p className="rounded border bg-amber-50 p-3 text-sm">Este contrato não possui materiais ou equipamentos pendentes de recebimento em estoque.</p>}
    {items.map((item, index) => {
      const source = processItems[index];
      const remaining = source.quantity - (source.receivedQuantity || 0);
      return <section key={item.purchaseProcessItemId} className="grid gap-3 rounded border p-3 md:grid-cols-4">
        <h3 className="text-sm font-semibold md:col-span-4">{source.material?.code} · {source.material?.name} · saldo a receber: {remaining} {source.material?.unitOfMeasure}</h3>
        <label className="grid gap-1 text-xs">Almoxarifado<select required={item.quantity > 0} value={item.warehouseId} onChange={event => updateItem(index, { warehouseId: event.target.value })} className={selectClass}><option value="">Selecione</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs">Quantidade<Input required type="number" min="0" max={remaining} step={source.material?.type === "PATRIMONIO" ? "1" : "any"} value={item.quantity} onChange={event => updateItem(index, { quantity: Number(event.target.value) })} /></label>
        <label className="grid gap-1 text-xs">Custo unitário<Input required type="number" min="0" step="0.01" value={item.unitCost} onChange={event => updateItem(index, { unitCost: Number(event.target.value) })} /></label>
        {([['batchNumber', 'Lote'], ['expirationDate', 'Validade'], ['brand', 'Marca'], ['model', 'Modelo'], ['serialNumber', 'Número de série']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs">{label}<Input type={key === "expirationDate" ? "date" : "text"} value={item[key]} onChange={event => updateItem(index, { [key]: event.target.value })} /></label>)}
      </section>;
    })}
    {feedback && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{feedback}</p>}
    <Button type="submit" disabled={pending || !contract || !items.length}>{pending ? "Aprovando..." : "Aprovar recebimento e registrar entrada"}</Button>
  </form>;
}
