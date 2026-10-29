"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { updateBenefitRequestItem, type BenefitRequestItemDraft } from "./benefit-item-drafts";

const columns: OperationalColumn[] = [
  { key: "order", label: "Item", type: "text", initialWidth: 70, minWidth: 56, resizable: true, sortable: false, details: "overflow" },
  { key: "benefit", label: "Benefício", type: "identifier", initialWidth: 420, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "quantity", label: "Quantidade", type: "text", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "none", align: "right" },
  { key: "value", label: "Valor financeiro", type: "text", initialWidth: 180, minWidth: 120, resizable: true, sortable: false, details: "none", align: "right" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 90, minWidth: 90, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];
const input = "h-6 w-full min-w-0 rounded border bg-white px-1 text-sm dark:bg-slate-900";

export function BenefitRequestItemsEditor({ items, setItems, benefits, pending }: {
  items: BenefitRequestItemDraft[]; setItems: Dispatch<SetStateAction<BenefitRequestItemDraft[]>>;
  benefits: { id: string; name: string; dispensingMode: string }[]; pending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [requestedPage, setPage] = useState(1);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = items.map((item, index) => ({ item, index })).filter(({ item, index }) => !term || `${index + 1} ${benefits.find((benefit) => benefit.id === item.benefitId)?.name || "Não selecionado"} ${item.benefitId}`.toLocaleLowerCase("pt-BR").includes(term));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const update = (id: string, patch: Parameters<typeof updateBenefitRequestItem>[2]) => setItems((current) => updateBenefitRequestItem(current, id, patch));

  return <OperationalTablePanel title="Benefícios solicitados" triggerLabel={`Editar benefícios (${items.length})`} description="Edite até 20 itens por página. Filtros, paginação e fechamento do painel preservam o conjunto completo da requisição.">
    <OperationalListFrame label="Itens da requisição" actions={<button type="button" className={styles.dialogButton} disabled={pending || items.length >= 30} onClick={() => { setItems((current) => current.length < 30 ? [...current, { draftId: crypto.randomUUID(), benefitId: "", quantity: 1, value: "" }] : current); setSearch(""); setPage(Math.ceil((items.length + 1) / OPERATIONAL_PAGE_SIZE)); }}>Adicionar benefício</button>}
      toolbar={<input aria-label="Filtrar itens da requisição" className={styles.searchInput} type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar benefício ou número do item" />}
      pagination={<OperationalPagination page={page} total={filtered.length} pending={pending} onPageChange={setPage} />}>
      <OperationalTable preferenceId="social-beneficio-itens-edicao" caption="Itens não salvos da requisição de benefícios" columns={columns} rows={filtered.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(({ item, index }) => {
        const benefit = benefits.find((option) => option.id === item.benefitId);
        return { id: item.draftId, label: `Item ${index + 1}`, values: { order: String(index + 1), benefit: benefit?.name || "Não selecionado", quantity: String(item.quantity), value: item.value || "—" }, cells: {
          benefit: <select aria-label={`Benefício do item ${index + 1}`} disabled={pending} required className={input} value={item.benefitId} onChange={(event) => update(item.draftId, { benefitId: event.target.value })}><option value="">Benefício</option>{benefits.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>,
          quantity: <input aria-label={`Quantidade do item ${index + 1}`} disabled={pending} required type="number" min="1" max="1000000" step="1" className={input} value={item.quantity} onChange={(event) => update(item.draftId, { quantity: Number(event.target.value) })} />,
          value: <input aria-label={`Valor financeiro do item ${index + 1}`} disabled={pending || benefit?.dispensingMode !== "VALUE"} required={benefit?.dispensingMode === "VALUE"} type="number" min="0.01" step="0.01" className={input} value={item.value} onChange={(event) => update(item.draftId, { value: event.target.value })} />,
        }, actions: <button type="button" disabled={pending || items.length === 1} onClick={() => setItems((current) => current.length > 1 ? current.filter((row) => row.draftId !== item.draftId) : current)}>Remover</button> };
      })} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
