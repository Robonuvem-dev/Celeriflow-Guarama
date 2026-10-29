"use client";

import Link from "next/link";
import { FileText, Pencil, Plus } from "lucide-react";
import { ComprasOperationalList, comprasColumn, comprasOptions } from "../_components/ComprasOperationalList";
import styles from "@/components/app-ui/operational/operational.module.css";

export type PurchasePlanningListRow = {
  id: string; itemName: string; description: string | null; unit: string; quantity: number;
  expectedPeriodStart: string; expectedPeriodEnd: string; estimatedValueDecimal: number; status: string;
  originId: string | null; originNumber: string | null; originObject: string | null;
};
type PlanningListClientProps = { plannings: PurchasePlanningListRow[]; canCreate: boolean; canUpdate: boolean };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatDate(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; }
const columns = [
  comprasColumn("item", "Item / serviço", 140, 240, "identifier"), comprasColumn("description", "Especificação", 140, 240),
  comprasColumn("quantity", "Quantidade", 80, 100, "text", "right"), comprasColumn("unit", "Unidade", 65, 80),
  comprasColumn("start", "Início esperado", 100, 120), comprasColumn("end", "Fim esperado", 100, 120),
  comprasColumn("estimate", "Valor estimado", 110, 140, "text", "right"), comprasColumn("origin", "Origem", 100, 130),
  comprasColumn("originObject", "Objeto de origem", 140, 200), comprasColumn("status", "Situação", 90, 110, "status"),
  comprasColumn("actions", "Ações", 72, 80, "actions"),
];

export function PlanningListClient({ plannings, canCreate, canUpdate }: PlanningListClientProps) {
  return <ComprasOperationalList label="Planejamento de Compras" preferenceId="compras-planejamento" columns={columns}
    description="Não gera contratação, reserva ou empenho."
    actions={canCreate ? <Link href="/compras/planejamento/novo" className={styles.newButton} aria-label="Novo planejamento" title="Novo planejamento"><Plus /><span className={styles.newLabel}>Novo planejamento</span></Link> : null}
    filters={[{ key: "status", label: "Situação", options: comprasOptions(plannings.map((row) => row.status)) }]}
    rows={plannings.map((planning) => ({ id: planning.id, label: planning.itemName,
      search: [planning.itemName, planning.description, planning.unit, planning.originNumber, planning.originObject, planning.status].filter(Boolean).join(" "),
      filters: { status: planning.status },
      values: { item: planning.itemName, description: planning.description || "-", quantity: String(planning.quantity), unit: planning.unit, start: formatDate(planning.expectedPeriodStart), end: formatDate(planning.expectedPeriodEnd), estimate: money.format(planning.estimatedValueDecimal), origin: planning.originNumber || "Direta", originObject: planning.originObject || "-", status: planning.status },
      cells: { item: <Link href={`/compras/planejamento/${planning.id}`}>{planning.itemName}</Link>, ...(planning.originId && planning.originNumber ? { origin: <Link href={`/compras/solicitacoes/${planning.originId}`}>{planning.originNumber}</Link> } : {}) },
      actions: <div className={styles.rowActions}><Link className={styles.iconButton} href={`/compras/planejamento/${planning.id}`} aria-label={`Consultar ${planning.itemName}`} title="Consultar"><FileText /></Link>{canUpdate && <Link className={styles.iconButton} href={`/compras/planejamento/${planning.id}/editar`} aria-label={`Editar ${planning.itemName}`} title="Editar"><Pencil /></Link>}</div>,
    }))} />;
}
