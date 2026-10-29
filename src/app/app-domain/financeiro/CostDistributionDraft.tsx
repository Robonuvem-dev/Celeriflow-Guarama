"use client";

import FinanceTablePanel from "./FinanceTablePanel";
import { financeColumn } from "./operational-columns";
import { draftField } from "./draft-rows";

type Row = { objectId: string; itemId: string; value: string };
export default function CostDistributionDraft({ title, rows, onChange, objects, items, percentages, disabled = false, allowRemove = true }: {
  title: string; rows: Row[]; onChange: (rows: Row[]) => void;
  objects: { id: string; label: string; itemIds: string[] }[]; items: { id: string; label: string }[];
  percentages: boolean; disabled?: boolean; allowRemove?: boolean;
}) {
  const update = (at: number, patch: Partial<Row>) => onChange(rows.map((row, index) => index === at ? { ...row, ...patch } : row));
  return <FinanceTablePanel label={title} preferenceId={`financeiro-distribuicao-${percentages ? "percentual" : "valor"}`} searchable={false}
    description="As linhas de todas as páginas permanecem no rascunho e são enviadas juntas."
    actions={<button type="button" disabled={disabled} onClick={() => onChange([...rows, { objectId: "", itemId: "", value: "" }])}>Adicionar distribuição</button>}
    columns={[financeColumn("object", "Objeto", 150, 350), financeColumn("item", "Item", 150, 350), financeColumn("value", percentages ? "Percentual" : "Valor BRL", 100, 180), ...(allowRemove ? [financeColumn("actions", "Ações", 90, 90, "actions")] : [])]}
    rows={rows.map((row, index) => ({ id: String(index), label: `Distribuição ${index + 1}`, values: { object: objects.find(item => item.id === row.objectId)?.label ?? row.objectId, item: items.find(item => item.id === row.itemId)?.label ?? row.itemId, value: row.value }, cells: {
      object: <select aria-label={`Objeto ${index + 1}`} className={draftField} disabled={disabled} value={row.objectId} onChange={event => update(index, { objectId: event.target.value, itemId: "" })}><option value="">Objeto</option>{objects.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>,
      item: <select aria-label={`Item ${index + 1}`} className={draftField} disabled={disabled} value={row.itemId} onChange={event => update(index, { itemId: event.target.value })}><option value="">Item relacionado</option>{items.filter(item => objects.find(object => object.id === row.objectId)?.itemIds.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>,
      value: <input aria-label={`${percentages ? "Percentual" : "Valor BRL"} ${index + 1}`} className={draftField} disabled={disabled} inputMode="decimal" value={row.value} onChange={event => update(index, { value: event.target.value.replace(",", ".") })} />,
    }, actions: allowRemove ? <button type="button" disabled={disabled || rows.length === 1} onClick={() => onChange(rows.filter((_, at) => at !== index))}>Remover</button> : undefined }))} />;
}
