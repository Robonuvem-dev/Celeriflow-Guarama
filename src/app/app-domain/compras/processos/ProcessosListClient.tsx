"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ComprasOperationalList, comprasColumn, comprasOptions } from "../_components/ComprasOperationalList";
import { ProcessoRowActions } from "./ProcessoRowActions";
import styles from "@/components/app-ui/operational/operational.module.css";

export type PurchaseProcessListRow = {
  id: string; number: string; object: string; type: string; modality: string | null;
  status: string; estimatedValue: number | null; secretariatName: string; itemCount: number;
  originCount: number; preliminaryStudyCount: number; termOfReferenceCount: number; createdAt: string;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const columns = [
  comprasColumn("number", "Número", 100, 140, "identifier"), comprasColumn("object", "Objeto", 160, 300),
  comprasColumn("type", "Tipo", 100, 140), comprasColumn("modality", "Modalidade", 100, 140),
  comprasColumn("secretariat", "Secretaria", 100, 140), comprasColumn("items", "Itens", 48, 60, "text", "right"),
  comprasColumn("origins", "Origens", 60, 70, "text", "right"), comprasColumn("estimate", "Estimativa", 110, 130, "text", "right"),
  comprasColumn("status", "Situação", 100, 140, "status"), comprasColumn("actions", "Ações", 96, 100, "actions"),
];

export function ProcessosListClient({ processes }: { processes: PurchaseProcessListRow[] }) {
  return <ComprasOperationalList label="Processos de Compra" preferenceId="compras-processos" columns={columns}
    description="Agrupamento de solicitações aprovadas. As origens e dotações permanecem disponíveis no detalhamento."
    actions={<Link href="/compras/processos/novo" className={styles.newButton} aria-label="Novo processo" title="Novo processo"><Plus /><span className={styles.newLabel}>Novo processo</span></Link>}
    filters={[{ key: "status", label: "Situação", options: comprasOptions(processes.map((row) => row.status)) }, { key: "type", label: "Tipo", options: comprasOptions(processes.map((row) => row.type)) }]}
    rows={processes.map((process) => ({ id: process.id, label: process.number,
      search: [process.number, process.object, process.type, process.modality ?? "", process.secretariatName].join(" "),
      filters: { status: process.status, type: process.type },
      values: { number: process.number, object: process.object, type: process.type, modality: process.modality || "Sem modalidade", secretariat: process.secretariatName, items: String(process.itemCount), origins: String(process.originCount || "-"), estimate: process.estimatedValue === null ? "-" : money.format(process.estimatedValue), status: process.status },
      cells: { number: <Link href={`/compras/processos/${process.id}`}>{process.number}</Link> },
      actions: <ProcessoRowActions id={process.id} />,
    }))} />;
}
