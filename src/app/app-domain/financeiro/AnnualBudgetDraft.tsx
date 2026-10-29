"use client";

import { MoneyInput } from "@/components/ui/MoneyInput";
import FinanceTablePanel from "./FinanceTablePanel";
import { financeColumn } from "./operational-columns";
import { draftField } from "./draft-rows";

type Row = { code: string; name: string; value: number };
export default function AnnualBudgetDraft({ title, rows, onChange }: { title: string; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const update = (at: number, patch: Partial<Row>) => onChange(rows.map((row, index) => index === at ? { ...row, ...patch } : row));
  return <FinanceTablePanel label={title} preferenceId="financeiro-loa-rascunho" searchable={false}
    columns={[financeColumn("code", "Código", 100, 180), financeColumn("name", "Nome", 150, 550), financeColumn("value", "Valor", 100, 180), financeColumn("actions", "Ações", 90, 90, "actions")]}
    rows={rows.map((row, index) => ({ id: String(index), label: row.name || `Linha ${index + 1}`, values: { code: row.code, name: row.name, value: String(row.value) }, cells: {
      code: <input aria-label={`Código ${index + 1}`} className={draftField} value={row.code} onChange={event => update(index, { code: event.target.value })} />,
      name: <input aria-label={`Nome ${index + 1}`} className={draftField} value={row.name} onChange={event => update(index, { name: event.target.value })} />,
      value: <MoneyInput aria-label={`Valor ${index + 1}`} className={draftField} value={row.value} onChange={value => update(index, { value })} />,
    }, actions: <button type="button" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, at) => at !== index))}>Remover</button> }))} />;
}
