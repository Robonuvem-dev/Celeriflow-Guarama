"use client";

import type { ReactNode } from "react";
import type { OperationalColumn } from "@/lib/operational-tables";
import { RhTablePanel } from "./RhTablePanel";
import { rhColumn } from "./operational-columns";

export function RhSelectionTable({ title, preferenceId, columns, items, selected, onSelectionAction, name, disabled = false, actions }: {
  title: string; preferenceId: string; columns: OperationalColumn[]; items: { id: string; label: string; values: Record<string, string> }[];
  selected: string[]; onSelectionAction: (ids: string[]) => void; name?: string; disabled?: boolean; actions?: ReactNode;
}) {
  const known = new Set(items.map(item => item.id));
  const payloadSelection = [...items.filter(item => selected.includes(item.id)).map(item => item.id), ...selected.filter(id => !known.has(id))];
  return <section className="space-y-2">
    {name && payloadSelection.map(id => <input key={id} type="hidden" name={name} value={id} />)}
    <p role="status">{selected.length} selecionados em todas as páginas</p>
    <RhTablePanel title={title} preferenceId={preferenceId} actions={actions} columns={[rhColumn("selected", "Sel.", 55, 45), ...columns]}
      rows={items.map(item => ({ ...item, values: { ...item.values, selected: selected.includes(item.id) ? "Sim" : "Não" }, cells: { selected: <input type="checkbox" aria-label={`Selecionar ${item.label}`} disabled={disabled} checked={selected.includes(item.id)} onChange={event => onSelectionAction(event.target.checked ? [...new Set([...selected, item.id])] : selected.filter(id => id !== item.id))} /> } }))} />
  </section>;
}
