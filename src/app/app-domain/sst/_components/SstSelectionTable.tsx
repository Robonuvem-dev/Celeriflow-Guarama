"use client";

import type { ReactNode } from "react";
import type { OperationalColumn } from "@/lib/operational-tables";
import { SstTablePanel } from "./SstTablePanel";
import { sstColumn } from "./operational-columns";
import { selectionDraftEntries } from "./draft-payload";

export function SstSelectionTable({ title, preferenceId, columns, items, selected, onSelectionAction, name, disabled = false, actions }: {
  title: string; preferenceId: string; columns: OperationalColumn[]; items: { id: string; label: string; values: Record<string, string> }[];
  selected: string[]; onSelectionAction: (ids: string[]) => void; name?: string; disabled?: boolean; actions?: ReactNode;
}) {
  return <section className="space-y-2">
    {name && selectionDraftEntries(name, selected, items.map(item => item.id)).map(([key, id]) => <input key={id} type="hidden" name={key} value={id} />)}
    <p role="status">{selected.length} selecionados em todas as páginas</p>
    <SstTablePanel title={title} preferenceId={preferenceId} actions={actions} columns={[sstColumn("selected", "Sel.", 55, 45), ...columns]}
      rows={items.map(item => ({ ...item, values: { ...item.values, selected: selected.includes(item.id) ? "Sim" : "Não" }, cells: { selected: <input type="checkbox" aria-label={`Selecionar ${item.label}`} disabled={disabled} checked={selected.includes(item.id)} onChange={event => onSelectionAction(event.target.checked ? [...new Set([...selected, item.id])] : selected.filter(id => id !== item.id))} /> } }))} />
  </section>;
}
