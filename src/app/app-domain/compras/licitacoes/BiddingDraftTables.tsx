"use client";

import { Plus, Trash2 } from "lucide-react";
import { ComprasPanelTable } from "../_components/ComprasPanelTable";
import { comprasColumn as column } from "../_components/columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const inputClass = "h-6 w-full min-w-0 rounded border bg-white px-1 text-[13px]";
type Member = { employeeId: string; role: string };
type Employee = { id: string; name: string; role: string | null };
const memberColumns = [column("employee", "Servidor", 180, 500, "identifier"), column("role", "Função", 120, 300), column("actions", "Ações", 48, 60, "actions")];

export function BiddingMembersTable({ members, employees, disabled, onChange, onAdd, onRemove }: {
  members: Member[]; employees: Employee[]; disabled: boolean;
  onChange: (index: number, values: Partial<Member>) => void; onAdd: () => void; onRemove: (index: number) => void;
}) {
  return <ComprasPanelTable editable title="Membros da designação" preferenceId="compras-licitacao-membros-edicao" columns={memberColumns}
    description="Membros e funções são mantidos no rascunho completo, inclusive fora da página visível."
    actions={<button type="button" className={styles.newButton} disabled={disabled} onClick={onAdd} aria-label="Adicionar membro"><Plus /><span className={styles.newLabel}>Adicionar membro</span></button>}
    rows={members.map((member, index) => ({ id: String(index), label: `Membro ${index + 1}`, values: { employee: employees.find((employee) => employee.id === member.employeeId)?.name || "Selecione o servidor", role: member.role }, cells: {
      employee: <select className={inputClass} aria-label={`Servidor do membro ${index + 1}`} value={member.employeeId} disabled={disabled} onChange={(event) => onChange(index, { employeeId: event.target.value })}><option value="">Selecione o servidor</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.role ? ` · ${employee.role}` : ""}</option>)}</select>,
      role: <input className={inputClass} aria-label={`Função do membro ${index + 1}`} value={member.role} disabled={disabled} onChange={(event) => onChange(index, { role: event.target.value })} />,
    }, actions: <button type="button" className={styles.iconButton} aria-label={`Remover membro ${index + 1}`} title="Remover membro" disabled={disabled || members.length <= 1} onClick={() => onRemove(index)}><Trash2 /></button> }))} />;
}

type ProcessItem = { id: string; label: string; unit: string; quantity: number; estimatedUnitValue: number | null };
const lotColumns = [column("selected", "Selecionar", 60, 75), column("name", "Item", 180, 400, "identifier"), column("available", "Quantidade disponível", 90, 130), column("unit", "Unidade", 65, 85), column("value", "Valor unitário", 110, 160, "text", "right"), column("quantity", "Quantidade no lote", 100, 150)];

export function BiddingLotItemsTable({ items, selected, disabled, onToggle, onQuantity }: {
  items: ProcessItem[]; selected: Record<string, string>; disabled: boolean;
  onToggle: (item: ProcessItem, checked: boolean) => void; onQuantity: (id: string, quantity: string) => void;
}) {
  return <ComprasPanelTable editable title="Selecionar itens do lote" preferenceId="compras-licitacao-lote-selecao" columns={lotColumns}
    description={`${Object.keys(selected).length} item(ns) selecionado(s) no rascunho completo. Busca e paginação não removem a seleção.`}
    rows={items.map((item) => {
      const checked = Object.prototype.hasOwnProperty.call(selected, item.id);
      return { id: item.id, label: item.label, values: { selected: checked ? "Selecionado" : "Não selecionado", name: item.label, available: String(item.quantity), unit: item.unit, value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.estimatedUnitValue ?? 0), quantity: selected[item.id] ?? "" }, cells: {
        selected: <input type="checkbox" aria-label={`Selecionar ${item.label}`} checked={checked} disabled={disabled} onChange={(event) => onToggle(item, event.target.checked)} />,
        quantity: <input className={inputClass} type="number" min="0.0001" max={item.quantity} step="any" disabled={disabled || !checked} value={selected[item.id] ?? ""} aria-label={`Quantidade de ${item.label}`} onChange={(event) => onQuantity(item.id, event.target.value)} />,
      } };
    })} />;
}
