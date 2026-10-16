"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHealthReceiptAction } from "./actions";

type Option = { id: string; name: string };
type Item = { key: number; materialId: string; batchNumber: string; expirationDate: string; productionDate: string; manufacturerName: string; quantity: string; unitCost: string };
const field = "h-8 min-w-0 rounded border bg-white px-2 text-xs";
const emptyItem = (key: number): Item => ({ key, materialId: "", batchNumber: "", expirationDate: "", productionDate: "", manufacturerName: "", quantity: "", unitCost: "" });

export function HealthReceiptForm({ warehouses, products, suppliers }: { warehouses: Option[]; products: Option[]; suppliers: Option[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([emptyItem(0)]);
  const [entryType, setEntryType] = useState("Fornecedor");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const idempotency = useRef(crypto.randomUUID());
  const nextKey = useRef(1);
  function change(key: number, values: Partial<Item>) { setItems(current => current.map(item => item.key === key ? { ...item, ...values } : item)); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    const form = event.currentTarget, data = new FormData(form);
    startTransition(async () => {
      const result = await saveHealthReceiptAction({ warehouseId: data.get("warehouseId"), supplierId: data.get("supplierId") || null, entryType, donorName: data.get("donorName") || null, invoiceNumber: data.get("invoiceNumber") || null, invoiceIssuedAt: data.get("invoiceIssuedAt") || null, fundingSource: data.get("fundingSource") || null, idempotencyKey: idempotency.current, items: items.map(item => ({ materialId: item.materialId, batchNumber: item.batchNumber, expirationDate: item.expirationDate, productionDate: item.productionDate || null, manufacturerName: item.manufacturerName || null, quantity: Number(item.quantity), unitCost: Number(item.unitCost) })) });
      if ("error" in result) { setMessage(result.error); return; }
      setMessage(result.status === "PENDING_APPROVAL" ? "Entrada registrada. Aguarda aprovação e ainda não altera o estoque." : "Entrada efetivada no estoque.");
      setItems([emptyItem(nextKey.current++)]); form.reset(); idempotency.current = crypto.randomUUID(); router.refresh();
    });
  }
  return <form onSubmit={submit} className="mt-2 grid gap-2">
    <label className="grid gap-1">Estoque<select name="warehouseId" required className={field}><option value="">Selecione</option>{warehouses.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
    <label className="grid gap-1">Tipo de entrada<select value={entryType} onChange={event => setEntryType(event.target.value)} className={field}><option>Fornecedor</option><option>Doação</option><option>Ajuste</option></select></label>
    {entryType === "Doação" ? <label className="grid gap-1">Nome do doador<input name="donorName" required maxLength={200} className={field} /></label> : <label className="grid gap-1">Fornecedor<select name="supplierId" className={field}><option value="">Selecione</option>{suppliers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}
    <label className="grid gap-1">Nota fiscal<input name="invoiceNumber" maxLength={60} className={field} /></label>
    <label className="grid gap-1">Emissão da nota<input name="invoiceIssuedAt" type="date" className={field} /></label>
    <label className="grid gap-1">Fonte de recurso<input name="fundingSource" maxLength={120} className={field} /></label>
    {items.map(item => <fieldset key={item.key} className="grid gap-1 rounded border p-2"><legend className="px-1 font-semibold">Produto da entrada</legend>
      <label className="grid gap-1">Produto<select value={item.materialId} onChange={event => change(item.key, { materialId: event.target.value })} required className={field}><option value="">Selecione</option>{products.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label className="grid gap-1">Lote<input required value={item.batchNumber} onChange={event => change(item.key, { batchNumber: event.target.value })} className={field} /></label>
      <label className="grid gap-1">Validade<input type="date" required value={item.expirationDate} onChange={event => change(item.key, { expirationDate: event.target.value })} className={field} /></label>
      <label className="grid gap-1">Fabricação<input type="date" value={item.productionDate} onChange={event => change(item.key, { productionDate: event.target.value })} className={field} /></label>
      <label className="grid gap-1">Fabricante<input maxLength={200} value={item.manufacturerName} onChange={event => change(item.key, { manufacturerName: event.target.value })} className={field} /></label>
      <label className="grid gap-1">Quantidade<input type="number" required min="0.000001" step="any" value={item.quantity} onChange={event => change(item.key, { quantity: event.target.value })} className={field} /></label>
      <label className="grid gap-1">Custo unitário<input type="number" required min="0" step="0.01" value={item.unitCost} onChange={event => change(item.key, { unitCost: event.target.value })} className={field} /></label>
      {items.length > 1 && <button type="button" onClick={() => setItems(current => current.filter(row => row.key !== item.key))} className="text-left underline">Remover produto</button>}
    </fieldset>)}
    <button type="button" onClick={() => setItems(current => [...current, emptyItem(nextKey.current++)])} className="rounded border py-2">Adicionar produto</button>
    {message && <p role="status" className="rounded bg-slate-50 p-2">{message}</p>}
    <button disabled={pending} className="h-8 rounded bg-emerald-700 font-semibold text-white">{pending ? "Registrando..." : "Registrar entrada"}</button>
  </form>;
}
