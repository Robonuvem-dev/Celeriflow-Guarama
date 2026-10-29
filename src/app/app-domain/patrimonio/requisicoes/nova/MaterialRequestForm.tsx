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
import { Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { operationalColumns } from "../../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

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
  const [page, setPage] = useState(1);
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const activePage = Math.min(page, Math.max(1, Math.ceil(items.length / OPERATIONAL_PAGE_SIZE)));
  const editingItem = items.find(item => item.key === editingKey);
  const selectClass = "h-8 w-full rounded border bg-white px-2 text-xs";

  function updateItem(key: number, values: Partial<ItemInput>) {
    setItems(current => current.map(item => item.key === key ? { ...item, ...values } : item));
  }
  function addItem() {
    const key = nextKey.current++;
    setItems(current => [...current, { key, material: null, quantityRequested: 1 }]);
    setPage(Math.ceil((items.length + 1) / OPERATIONAL_PAGE_SIZE));
    setEditingKey(key);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFeedback(null);
    const invalidIndex = items.findIndex(item => !item.material || !Number.isFinite(item.quantityRequested) || item.quantityRequested < 0.000001);
    if (invalidIndex >= 0) {
      setPage(Math.floor(invalidIndex / OPERATIONAL_PAGE_SIZE) + 1);
      setFeedback(`Selecione o material e informe quantidade maior que zero no item ${invalidIndex + 1}, inclusive nas outras páginas.`);
      return;
    }
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
    <form id="material-request" onSubmit={submit} className="space-y-4 rounded border bg-white p-4">
      <div className="grid items-start gap-3 md:grid-cols-2">
        <div className="grid gap-1 text-xs font-semibold">Código<Input readOnly value="Gerado automaticamente: REQ-AAAA-000001" className="bg-slate-50 text-xs" /></div>
        <label className="grid gap-1 text-xs font-semibold">Almoxarifado de origem *<select required value={warehouseId} onChange={event => { setWarehouseId(event.target.value); setEditingKey(null); setItems(current => current.map(item => ({ ...item, material: null }))); }} className={selectClass}><option value="">Selecione a origem do estoque</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold">Setor de destino *<select required value={departmentId} disabled={!canSelectRequester} onChange={event => { setDepartmentId(event.target.value); setRequester(null); }} className={selectClass}><option value="">Selecione o setor que receberá</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        {canSelectRequester ? <SearchReferenceField key={departmentId} label="Servidor solicitante / recebedor *" kind="employees" value={requester?.id || ""} selectedLabel={requester?.label || ""} filters={{ departmentId }} onSelect={record => { setRequester(record); if (record?.departmentId) setDepartmentId(record.departmentId); }} /> : <div className="text-xs"><p className="font-semibold">Servidor solicitante / recebedor</p><p className="mt-1 rounded border bg-slate-50 p-2">{requester?.label || "Seu usuário precisa estar vinculado a um servidor cadastrado."}</p></div>}
      </div>
      <label className="grid gap-1 text-xs font-semibold">Justificativa<textarea required value={justification} maxLength={1000} onChange={event => setJustification(event.target.value)} rows={2} className="rounded border px-3 py-2 text-sm" placeholder="Informe a finalidade dos materiais para o setor de destino" /></label>
      <section className="space-y-3 border-t pt-3">
        <h2 className="text-sm font-semibold">Itens solicitados · {items.length}</h2>
        {!warehouseId && <p className="text-xs text-slate-500">Selecione o almoxarifado de origem para pesquisar os materiais disponíveis.</p>}
        <OperationalTablePanel title="Itens da nova requisição" description="Seleção e quantidades permanecem no formulário ao fechar a consulta ou trocar de página.">
          <OperationalListFrame label="Itens solicitados" actions={<><button type="button" disabled={pending || !warehouseId} className={styles.newButton} onClick={addItem}>Adicionar item</button><button type="submit" form="material-request" disabled={pending || !warehouseId || !requester || items.some(item => !item.material)} className={styles.dialogButton}>Registrar e acompanhar</button>{feedback && <OperationalFilters label="Resultado"><p role="alert">{feedback}</p></OperationalFilters>}</>}
            toolbar={<span>Selecione o material pelo botão de edição; as quantidades são editáveis na grade.</span>}
            pagination={<OperationalPagination page={activePage} total={items.length} onPageChange={setPage} />}>
            <OperationalTable preferenceId="patrimonio-requisicao-nova-itens-edicao" caption="Itens solicitados" columns={operationalColumns([["material", "Material", 400, 160, "identifier"], ["detail", "Descrição", 250, 110], ["unit", "Unidade", 90, 65], ["quantity", "Quantidade", 130, 90, "text", "right"], ["stock", "Saldo na origem", 130, 90, "text", "right"], ["actions", "Ações", 80, 75, "actions"]])}
              rows={items.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(item => ({ id: String(item.key), label: item.material?.label || `Item ${item.key + 1}`, values: { material: item.material?.label || "Selecione o material", detail: item.material?.detail || "—", unit: item.material?.unitOfMeasure || "—", quantity: String(item.quantityRequested), stock: item.material?.quantity?.toLocaleString("pt-BR") || "—" },
                cells: { quantity: <input form="material-request" aria-label={`Quantidade do item ${item.key + 1}`} type="number" required min="0.000001" step="any" disabled={pending} value={item.quantityRequested} onChange={event => updateItem(item.key, { quantityRequested: Number(event.target.value) })} className="h-6 w-full min-w-0 rounded border bg-transparent px-1" /> },
                actions: <div className={styles.rowActions}><button type="button" disabled={pending || !warehouseId} className={styles.iconButton} aria-label={`Selecionar material do item ${item.key + 1}`} onClick={() => setEditingKey(item.key)}><Pencil /></button><button type="button" disabled={pending || items.length === 1} className={styles.iconButton} aria-label={`Remover item ${item.key + 1}`} onClick={() => setItems(current => current.filter(row => row.key !== item.key))}><Trash2 /></button></div>,
              }))} />
          </OperationalListFrame>
          <Dialog open={Boolean(editingItem)} onOpenChange={open => { if (!open) setEditingKey(null); }}><DialogContent><DialogHeader><DialogTitle>Material do item</DialogTitle><DialogDescription>Altere os filtros e pesquise no almoxarifado de origem. A seleção permanece no rascunho.</DialogDescription></DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2"><label>Categoria<select aria-label="Categoria dos materiais" value={categoryId} onChange={event => setCategoryId(event.target.value)} className={selectClass}><option value="">Todas as categorias</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Tipo<select aria-label="Tipo dos materiais" value={type} onChange={event => setType(event.target.value)} className={selectClass}><option value="">Todos os tipos</option><option value="MATERIAL">Material</option><option value="PATRIMONIO">Equipamento</option></select></label><label><input type="checkbox" checked={inStock} onChange={event => setInStock(event.target.checked)} /> Somente com saldo na origem</label></div>
            {editingItem && <><SearchReferenceField key={`${warehouseId}-${categoryId}-${type}-${inStock}-${editingItem.key}`} label="Pesquisar material *" kind="materials" value={editingItem.material?.id || ""} selectedLabel={editingItem.material?.label || ""} filters={{ warehouseId, categoryId, type, inStock: String(inStock) }} onSelect={record => updateItem(editingItem.key, { material: record })} /><label>Quantidade<Input form="material-request" type="number" required min="0.000001" step="any" disabled={pending} value={editingItem.quantityRequested} onChange={event => updateItem(editingItem.key, { quantityRequested: Number(event.target.value) })} /></label></>}
          </DialogContent></Dialog>
        </OperationalTablePanel>
      </section>
      {feedback && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{feedback}</p>}
      <div className="flex justify-end border-t pt-3"><Button type="submit" disabled={pending || !warehouseId || !requester || items.some(item => !item.material)}>{pending ? "Registrando..." : "Registrar e acompanhar"}</Button></div>
    </form>
  </PageFrame>;
}
