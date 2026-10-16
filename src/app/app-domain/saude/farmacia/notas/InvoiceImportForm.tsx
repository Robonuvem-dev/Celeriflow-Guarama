"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { parsePharmacyInvoice } from "@/lib/saude/pharmacy-invoice";
import { importPharmacyInvoiceAction, previewPharmacyInvoiceAction } from "./actions";
type Option = { id: string; name: string };
const field = "w-full rounded border bg-white p-2 text-sm";
export function InvoiceImportForm({ warehouses, products, suppliers }: { warehouses: Option[]; products: (Option & { unit: string })[]; suppliers: (Option & { cnpj: string })[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [invoice, setInvoice] = useState<ReturnType<typeof parsePharmacyInvoice> | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="space-y-4">
    <label className="grid gap-2 text-sm">XML da NF-e<input type="file" accept=".xml,application/xml,text/xml" disabled={pending} onChange={event => {
      const file = event.target.files?.[0]; setInvoice(null); setContent(""); setError(""); setSuccess("");
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { setError("O XML deve ter até 2 MB."); return; }
      startTransition(async () => { try { const xml = await file.text(); const result = await previewPharmacyInvoiceAction(xml); if (result.error) { setError(result.error); return; } if (result.invoice) { setContent(xml); setInvoice(result.invoice); } } catch { setError("Não foi possível consultar a prévia da NF-e."); } });
    }} className={field} /></label>
    {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    {invoice && <form onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setError(""); setSuccess("");
      startTransition(async () => {
        try {
          const result = await importPharmacyInvoiceAction({ content, warehouseId: String(form.get("warehouseId") || ""), supplierId: String(form.get("supplierId") || ""), mappings: invoice.items.map(item => ({ sourceKey: item.key, materialId: String(form.get(`material.${item.key}`) || ""), conversionFactor: Number(form.get(`factor.${item.key}`)), batchNumber: String(form.get(`batch.${item.key}`) || ""), productionDate: String(form.get(`production.${item.key}`) || "") || null, expirationDate: String(form.get(`expiration.${item.key}`) || ""), manufacturerName: String(form.get(`manufacturer.${item.key}`) || "") || null })) });
          if (result.error) { setError(result.error); return; }
          if (result.receipt) { setSuccess(`Entrada registrada: ${result.receipt.status === "PENDING_APPROVAL" ? "aguardando aprovação do estoque" : "estoque atualizado"}.`); setInvoice(null); setContent(""); router.refresh(); }
        } catch { setError("Não foi possível consultar a confirmação. Reenvie o mesmo XML para conferir o registro."); }
      });
    }} className="space-y-4">
      <div className="rounded border bg-slate-50 p-3 text-sm"><p className="font-semibold">NF-e {invoice.invoiceNumber} · série {invoice.series} · {invoice.supplierName}</p><p>CNPJ {invoice.supplierCnpj} · emissão {new Date(invoice.invoiceIssuedAt).toLocaleString("pt-BR")}</p><p className="break-all">Chave: {invoice.invoiceKey}</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Estoque de destino<select name="warehouseId" required className={field}><option value="">Selecione</option>{warehouses.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="grid gap-1 text-sm">Fornecedor cadastrado<select name="supplierId" required defaultValue={suppliers.find(supplier => supplier.cnpj.replace(/\D/g, "") === invoice.supplierCnpj)?.id || ""} className={field}><option value="">Selecione o emitente</option>{suppliers.filter(supplier => supplier.cnpj.replace(/\D/g, "") === invoice.supplierCnpj).map(option => <option key={option.id} value={option.id}>{option.name} · {option.cnpj}</option>)}</select></label></div>
      <p className="text-sm">Associe cada item ao produto único. O fator indica quantas unidades de estoque correspondem a uma unidade comercial da nota; a conversão mantém o valor do item. Lote e validade informados no XML são preservados.</p>
      {invoice.items.map(item => <fieldset key={item.key} className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Item {item.line} · {item.description}</legend><p className="text-sm sm:col-span-2">Código do fornecedor {item.supplierCode} · {item.quantity} {item.unit} · R$ {item.unitCost.toFixed(4)} por unidade comercial</p><label className="grid gap-1 text-sm">Produto e unidade de estoque<select name={`material.${item.key}`} required className={field}><option value="">Selecione</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}</select></label><label className="grid gap-1 text-sm">Fator de conversão<input name={`factor.${item.key}`} type="number" min="0.000001" step="any" required defaultValue="1" className={field} /></label><label className="grid gap-1 text-sm">Lote<input name={`batch.${item.key}`} required defaultValue={item.batchNumber} readOnly={!!item.batchNumber} className={field} /></label><label className="grid gap-1 text-sm">Validade<input name={`expiration.${item.key}`} type="date" required defaultValue={item.expirationDate?.slice(0, 10) || ""} readOnly={!!item.expirationDate} className={field} /></label><label className="grid gap-1 text-sm">Fabricação<input name={`production.${item.key}`} type="date" defaultValue={item.productionDate?.slice(0, 10) || ""} readOnly={!!item.productionDate} className={field} /></label><label className="grid gap-1 text-sm">Fabricante<input name={`manufacturer.${item.key}`} className={field} /></label></fieldset>)}
      <button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">{pending ? "Registrando…" : "Registrar entrada conforme a política de aprovação"}</button>
    </form>}
  </div>;
}
