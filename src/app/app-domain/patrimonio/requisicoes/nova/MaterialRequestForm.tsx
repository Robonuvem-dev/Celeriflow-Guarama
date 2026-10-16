"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SearchReferenceField, type SearchReferenceRecord } from "../../_components/SearchReferenceField";
import { createMaterialRequestAction } from "../actions";

type Option = { id: string; name: string };
type ItemInput = { key: number; material: SearchReferenceRecord | null; quantityRequested: number };

export function MaterialRequestForm({ warehouses, departments, categories, initialRequester, canSelectRequester }: { warehouses: Option[]; departments: Option[]; categories: Option[]; initialRequester: SearchReferenceRecord | null; canSelectRequester: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const nextKey = useRef(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [requester, setRequester] = useState(initialRequester);
  const [departmentId, setDepartmentId] = useState(initialRequester?.departmentId || "");
  const [justification, setJustification] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState("");
  const [inStock, setInStock] = useState(true);
  const [items, setItems] = useState<ItemInput[]>([{ key: 0, material: null, quantityRequested: 1 }]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectClass = "h-8 w-full rounded border bg-white px-2 text-xs";

  function updateItem(key: number, values: Partial<ItemInput>) {
    setItems(current => current.map(item => item.key === key ? { ...item, ...values } : item));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await createMaterialRequestAction({ sourceWarehouseId: warehouseId, requesterId: requester?.id || "", departmentId, justification: justification || undefined, idempotencyKey: idempotencyKey.current, items: items.map(item => ({ materialId: item.material?.id || "", quantityRequested: item.quantityRequested })) });
        if (result.error) setFeedback(result.error);
        else router.push(`/patrimonio/requisicoes/${encodeURIComponent(result.requestId!)}`);
      } catch { setFeedback("Não foi possível confirmar o registro. Tente novamente."); }
    });
  }

  return <PageFrame className="min-h-0 max-w-5xl flex-1 space-y-3 overflow-y-auto p-3">
    <PageHeader title="Nova requisição interna" action={<Link href="/patrimonio/requisicoes" className="text-xs underline">Voltar</Link>} />
    <p className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">1. Registrar pedido → 2. Aprovar quantidades → 3. Entregar materiais. O estoque é baixado na entrega, com origem, destino e histórico.</p>
    <form onSubmit={submit} className="space-y-4 rounded border bg-white p-4">
      <div className="grid items-start gap-3 md:grid-cols-2">
        <div className="grid gap-1 text-xs font-semibold">Código<Input readOnly value="Gerado automaticamente: REQ-AAAA-000001" className="bg-slate-50 text-xs" /></div>
        <label className="grid gap-1 text-xs font-semibold">Almoxarifado de origem *<select required value={warehouseId} onChange={event => { setWarehouseId(event.target.value); setItems(current => current.map(item => ({ ...item, material: null }))); }} className={selectClass}><option value="">Selecione a origem do estoque</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold">Setor de destino *<select required value={departmentId} disabled={!canSelectRequester} onChange={event => { setDepartmentId(event.target.value); setRequester(null); }} className={selectClass}><option value="">Selecione o setor que receberá</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        {canSelectRequester ? <SearchReferenceField key={departmentId} label="Servidor solicitante / recebedor *" kind="employees" value={requester?.id || ""} selectedLabel={requester?.label || ""} filters={{ departmentId }} onSelect={record => { setRequester(record); if (record?.departmentId) setDepartmentId(record.departmentId); }} /> : <div className="text-xs"><p className="font-semibold">Servidor solicitante / recebedor</p><p className="mt-1 rounded border bg-slate-50 p-2">{requester?.label || "Seu usuário precisa estar vinculado a um servidor cadastrado."}</p></div>}
      </div>
      <label className="grid gap-1 text-xs font-semibold">Justificativa<textarea required value={justification} maxLength={1000} onChange={event => setJustification(event.target.value)} rows={2} className="rounded border px-3 py-2 text-sm" placeholder="Informe a finalidade dos materiais para o setor de destino" /></label>
      <section className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Itens solicitados</h2><Button type="button" size="sm" variant="outline" onClick={() => { const key = nextKey.current++; setItems(current => [...current, { key, material: null, quantityRequested: 1 }]); }}>Adicionar item</Button></div>
        <div className="flex flex-wrap items-center gap-2"><select aria-label="Categoria dos materiais" value={categoryId} onChange={event => setCategoryId(event.target.value)} className={`${selectClass} max-w-56`}><option value="">Todas as categorias</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select aria-label="Tipo dos materiais" value={type} onChange={event => setType(event.target.value)} className={`${selectClass} max-w-40`}><option value="">Todos os tipos</option><option value="MATERIAL">Material</option><option value="PATRIMONIO">Equipamento</option></select><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={inStock} onChange={event => setInStock(event.target.checked)} />Somente com saldo na origem</label></div>
        {!warehouseId ? <p className="text-xs text-slate-500">Selecione o almoxarifado de origem para pesquisar os materiais disponíveis.</p> : items.map(item => <div key={item.key} className="grid items-start gap-3 rounded border p-3 md:grid-cols-[1fr_8rem_auto]">
          <SearchReferenceField key={`${warehouseId}-${categoryId}-${type}-${inStock}-${item.key}`} label="Pesquisar material *" kind="materials" value={item.material?.id || ""} selectedLabel={item.material?.label || ""} filters={{ warehouseId, categoryId, type, inStock: String(inStock) }} onSelect={record => updateItem(item.key, { material: record })} />
          <label className="grid gap-1 text-xs font-semibold">Quantidade<Input type="number" required min="0.000001" step="any" value={item.quantityRequested} onChange={event => updateItem(item.key, { quantityRequested: Number(event.target.value) })} />{item.material && <span className="text-[11px] font-normal text-slate-500">{item.material.unitOfMeasure} · saldo {item.material.quantity?.toLocaleString("pt-BR")}</span>}</label>
          <Button type="button" size="sm" variant="outline" disabled={items.length === 1} onClick={() => setItems(current => current.filter(row => row.key !== item.key))}>Remover</Button>
        </div>)}
      </section>
      {feedback && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{feedback}</p>}
      <div className="flex justify-end border-t pt-3"><Button type="submit" disabled={pending || !warehouseId || !requester || items.some(item => !item.material)}>{pending ? "Registrando..." : "Registrar e acompanhar"}</Button></div>
    </form>
  </PageFrame>;
}
