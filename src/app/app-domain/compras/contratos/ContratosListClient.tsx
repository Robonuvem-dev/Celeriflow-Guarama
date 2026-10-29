"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ComprasOperationalList, comprasColumn, comprasOptions } from "../_components/ComprasOperationalList";
import { ContratoRowActions } from "./ContratoRowActions";
import styles from "@/components/app-ui/operational/operational.module.css";

type ContractListRow = {
  id: string; number: string; supplierName: string; object: string; secretariatName: string;
  budgetUnitLabel: string | null; startDate: string; endDate: string; termDays: number;
  updatedValue: number; amendmentCount: number; status: string;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)); }
const columns = [
  comprasColumn("number", "Contrato", 100, 140, "identifier"), comprasColumn("supplier", "Fornecedor", 140, 200),
  comprasColumn("object", "Objeto", 160, 280), comprasColumn("start", "Início", 90, 110), comprasColumn("end", "Fim", 90, 110),
  comprasColumn("term", "Dias", 48, 60, "text", "right"), comprasColumn("secretariat", "Secretaria", 100, 140),
  comprasColumn("unit", "Unidade gestora", 120, 180), comprasColumn("value", "Valor atual", 110, 130, "text", "right"),
  comprasColumn("amendments", "Aditivos", 64, 75, "text", "right"), comprasColumn("status", "Situação", 90, 110, "status"),
  comprasColumn("actions", "Ações", 96, 100, "actions"),
];

export function ContratosListClient({ contracts }: { contracts: ContractListRow[] }) {
  return <ComprasOperationalList label="Gestão de Contratos" preferenceId="compras-contratos" columns={columns}
    description="Medições e parcelas são geridas na ficha do instrumento."
    actions={<><Link href="/compras/convenios" className={styles.filterButton}>Convênios</Link><Link href="/compras/contratos/novo" className={styles.newButton} aria-label="Novo contrato" title="Novo contrato"><Plus /><span className={styles.newLabel}>Novo contrato</span></Link></>}
    filters={[{ key: "status", label: "Situação", options: comprasOptions(contracts.map((row) => row.status)) }]}
    rows={contracts.map((contract) => ({ id: contract.id, label: contract.number,
      search: [contract.number, contract.supplierName, contract.object, contract.secretariatName, contract.budgetUnitLabel ?? "", contract.status].join(" "), filters: { status: contract.status },
      values: { number: contract.number, supplier: contract.supplierName, object: contract.object, start: formatDate(contract.startDate), end: formatDate(contract.endDate), term: String(contract.termDays), secretariat: contract.secretariatName, unit: contract.budgetUnitLabel || "Pendente de regularização", value: money.format(contract.updatedValue), amendments: String(contract.amendmentCount), status: contract.status },
      cells: { number: <Link href={`/compras/contratos/${contract.id}`}>{contract.number}</Link> }, actions: <ContratoRowActions id={contract.id} />,
    }))} />;
}
