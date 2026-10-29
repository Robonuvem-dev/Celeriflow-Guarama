"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ComprasOperationalList, comprasColumn, comprasOptions } from "../_components/ComprasOperationalList";
import { ConvenioRowActions } from "./ConvenioRowActions";
import styles from "@/components/app-ui/operational/operational.module.css";

type CovenantListRow = {
  id: string; number: string; grantor: string; description: string; totalValueDecimal: number;
  startDate: string; endDate: string; termDays: number; status: string;
  partyCount: number; measurementCount: number; installmentCount: number;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)); }
const columns = [
  comprasColumn("number", "Convênio", 100, 140, "identifier"), comprasColumn("grantor", "Concedente", 140, 200),
  comprasColumn("object", "Objeto", 160, 280), comprasColumn("start", "Início", 90, 110), comprasColumn("end", "Fim", 90, 110),
  comprasColumn("term", "Dias", 48, 60, "text", "right"), comprasColumn("value", "Valor total", 110, 130, "text", "right"),
  comprasColumn("parties", "Partes", 60, 70, "text", "right"), comprasColumn("measurements", "Medições", 75, 90, "text", "right"),
  comprasColumn("installments", "Parcelas", 70, 85, "text", "right"), comprasColumn("status", "Situação", 90, 110, "status"), comprasColumn("actions", "Ações", 96, 100, "actions"),
];

export function ConveniosListClient({ covenants }: { covenants: CovenantListRow[] }) {
  return <ComprasOperationalList label="Gestão de Convênios" preferenceId="compras-convenios" columns={columns}
    description="Financeiro é exibido apenas quando houver vínculo real."
    actions={<><Link href="/compras/contratos" className={styles.filterButton}>Contratos</Link><Link href="/compras/convenios/novo" className={styles.newButton} aria-label="Novo convênio" title="Novo convênio"><Plus /><span className={styles.newLabel}>Novo convênio</span></Link></>}
    filters={[{ key: "status", label: "Situação", options: comprasOptions(covenants.map((row) => row.status)) }]}
    rows={covenants.map((covenant) => ({ id: covenant.id, label: covenant.number,
      search: [covenant.number, covenant.grantor, covenant.description, covenant.status].join(" "), filters: { status: covenant.status },
      values: { number: covenant.number, grantor: covenant.grantor, object: covenant.description, start: formatDate(covenant.startDate), end: formatDate(covenant.endDate), term: String(covenant.termDays), value: money.format(covenant.totalValueDecimal), parties: String(covenant.partyCount), measurements: String(covenant.measurementCount), installments: String(covenant.installmentCount), status: covenant.status },
      cells: { number: <Link href={`/compras/convenios/${covenant.id}`}>{covenant.number}</Link> }, actions: <ConvenioRowActions id={covenant.id} />,
    }))} />;
}
