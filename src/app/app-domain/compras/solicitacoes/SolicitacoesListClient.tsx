"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ComprasOperationalList, comprasColumn, comprasOptions } from "../_components/ComprasOperationalList";
import { SolicitacaoRowActions } from "./SolicitacaoRowActions";
import styles from "@/components/app-ui/operational/operational.module.css";

export type PurchaseRequestListRow = {
  id: string; number: string; object: string; status: string; priority: string;
  estimatedValue: number | null; createdAt: string; secretariatName: string;
  departmentName: string; requesterName: string; itemCount: number; canManage: boolean;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const columns = [
  comprasColumn("number", "Número", 100, 140, "identifier"),
  comprasColumn("object", "Objeto", 160, 300),
  comprasColumn("itemCount", "Itens", 48, 60, "text", "right"),
  comprasColumn("secretariat", "Secretaria", 100, 160),
  comprasColumn("department", "Departamento", 100, 140),
  comprasColumn("requester", "Solicitante", 100, 140),
  comprasColumn("estimate", "Estimativa", 110, 130, "text", "right"),
  comprasColumn("status", "Situação", 90, 110, "status"),
  comprasColumn("priority", "Prioridade", 80, 100, "status"),
  comprasColumn("actions", "Ações", 96, 100, "actions"),
];

export function SolicitacoesListClient({ requests }: { requests: PurchaseRequestListRow[] }) {
  return <ComprasOperationalList label="Solicitações de Compra" preferenceId="compras-solicitacoes" columns={columns}
    description="Não gera reserva ou empenho automaticamente."
    actions={<Link href="/compras/solicitacoes/novo" className={styles.newButton} aria-label="Nova solicitação" title="Nova solicitação"><Plus /><span className={styles.newLabel}>Nova solicitação</span></Link>}
    filters={[{ key: "status", label: "Situação", options: comprasOptions(requests.map((row) => row.status)) }, { key: "priority", label: "Prioridade", options: comprasOptions(requests.map((row) => row.priority)) }]}
    rows={requests.map((request) => ({ id: request.id, label: request.number,
      search: [request.number, request.object, request.secretariatName, request.departmentName, request.requesterName].join(" "),
      filters: { status: request.status, priority: request.priority },
      values: { number: request.number, object: request.object, itemCount: String(request.itemCount), secretariat: request.secretariatName, department: request.departmentName, requester: request.requesterName, estimate: request.estimatedValue === null ? "-" : money.format(request.estimatedValue), status: request.status, priority: request.priority },
      cells: { number: <Link href={`/compras/solicitacoes/${request.id}`}>{request.number}</Link> },
      actions: <SolicitacaoRowActions id={request.id} canManage={request.canManage} />,
    }))} />;
}
