"use client";

import { Trash2 } from "lucide-react";
import { ComprasPanelTable } from "../_components/ComprasPanelTable";
import { comprasColumn as column } from "../_components/columns";
import styles from "@/components/app-ui/operational/operational.module.css";

type Allocation = { budgetAppropriationId: string; quantity: number; value: number };
type Appropriation = { id: string; code: string; budgetUnitName: string; expenseNatureCode: string; expenseNatureName: string; resourceSourceCode: string; resourceSourceName: string; financialYear: number };
const inputClass = "h-6 w-full min-w-0 rounded border bg-white px-1 text-[13px]";
const columns = [column("appropriation", "Dotação", 110, 160, "identifier"), column("unit", "Unidade gestora", 120, 160), column("natureCode", "Código da natureza", 85, 110), column("natureName", "Natureza da despesa", 120, 170), column("sourceCode", "Código da fonte", 70, 90), column("sourceName", "Fonte de recursos", 120, 160), column("year", "Exercício", 65, 80), column("quantity", "Quantidade", 80, 100), column("value", "Valor", 95, 120), column("actions", "Ações", 48, 60, "actions")];

export function AllocationDraftTable({ title, allocations, appropriations, disabled, onChange, onRemove }: {
  title: string; allocations: Allocation[]; appropriations: Appropriation[]; disabled: boolean;
  onChange: (index: number, field: keyof Allocation, value: string | number) => void; onRemove: (index: number) => void;
}) {
  return <ComprasPanelTable editable title={title} preferenceId="compras-solicitacao-rateios-edicao" columns={columns}
    description="O rascunho completo permanece na solicitação. A paginação não altera totais nem o payload de alocações."
    rows={allocations.map((allocation, index) => {
      const appropriation = appropriations.find((option) => option.id === allocation.budgetAppropriationId);
      return { id: String(index), label: `Alocação ${index + 1}`, values: { appropriation: appropriation?.code || "Selecione a dotação", unit: appropriation?.budgetUnitName || "-", natureCode: appropriation?.expenseNatureCode || "-", natureName: appropriation?.expenseNatureName || "-", sourceCode: appropriation?.resourceSourceCode || "-", sourceName: appropriation?.resourceSourceName || "-", year: String(appropriation?.financialYear ?? "-"), quantity: String(allocation.quantity), value: String(allocation.value) }, cells: {
        appropriation: <select className={inputClass} aria-label={`Dotação da alocação ${index + 1}`} value={allocation.budgetAppropriationId} disabled={disabled} onChange={(event) => onChange(index, "budgetAppropriationId", event.target.value)}><option value="">Selecione a dotação</option>{appropriations.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.expenseNatureCode} · {option.resourceSourceCode} ({option.financialYear})</option>)}</select>,
        quantity: <input className={inputClass} aria-label={`Quantidade da alocação ${index + 1}`} type="number" min="0.01" step="0.01" value={allocation.quantity} disabled={disabled} onChange={(event) => onChange(index, "quantity", Number(event.target.value) || 0)} />,
        value: <input className={inputClass} aria-label={`Valor da alocação ${index + 1}`} type="number" min="0" step="0.01" value={allocation.value} disabled={disabled} onChange={(event) => onChange(index, "value", Number(event.target.value) || 0)} />,
      }, actions: <button type="button" className={styles.iconButton} disabled={disabled} aria-label={`Remover alocação ${index + 1}`} title="Remover alocação" onClick={() => onRemove(index)}><Trash2 /></button> };
    })} />;
}
