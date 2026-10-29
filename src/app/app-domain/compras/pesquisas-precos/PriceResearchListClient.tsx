"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { ComprasOperationalList, comprasColumn } from "../_components/ComprasOperationalList";
import styles from "@/components/app-ui/operational/operational.module.css";

type PriceResearchListRow = {
  id: string; status: string; deadlineAt: string; estimatedValue: number | null;
  process: { number: string; object: string; purchaseRequestNumber: string | null }; submittedQuoteCount: number;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const columns = [
  comprasColumn("number", "Processo", 100, 140, "identifier"), comprasColumn("request", "Solicitação", 100, 140),
  comprasColumn("object", "Objeto", 160, 320), comprasColumn("deadline", "Encerramento", 140, 170),
  comprasColumn("quotes", "Cotações", 75, 90, "text", "right"), comprasColumn("estimate", "Referência", 110, 130, "text", "right"),
  comprasColumn("status", "Situação", 100, 130, "status"), comprasColumn("actions", "Ação", 64, 72, "actions"),
];

export function PriceResearchListClient({ researches }: { researches: PriceResearchListRow[] }) {
  return <ComprasOperationalList label="Pesquisas de Preços" preferenceId="compras-pesquisas-precos" columns={columns}
    description="Referência por média das propostas apresentadas. Disponibilidade orçamentária não é inferida nesta rotina."
    actions={<Link href="/compras/pesquisas-precos/nova" className={styles.newButton} aria-label="Nova pesquisa" title="Nova pesquisa"><Plus /><span className={styles.newLabel}>Nova pesquisa</span></Link>}
    filters={[{ key: "status", label: "Situação", options: [{ value: "OPEN", label: "Em andamento" }, { value: "CLOSED", label: "Encerradas" }] }]}
    rows={researches.map((research) => ({ id: research.id, label: research.process.number,
      search: [research.process.number, research.process.object, research.process.purchaseRequestNumber ?? "", research.status === "Em Andamento" ? "Em andamento" : research.status].join(" "), filters: { status: research.status === "Em Andamento" ? "OPEN" : "CLOSED" },
      values: { number: research.process.number, request: research.process.purchaseRequestNumber ?? "Não vinculada", object: research.process.object, deadline: new Date(research.deadlineAt).toLocaleString("pt-BR"), quotes: String(research.submittedQuoteCount), estimate: research.estimatedValue === null ? "Sem proposta" : money.format(research.estimatedValue), status: research.status === "Em Andamento" ? "Em andamento" : research.status },
      cells: { number: <Link href={`/compras/pesquisas-precos/${research.id}`}>{research.process.number}</Link> }, actions: <Link href={`/compras/pesquisas-precos/${research.id}`} className={styles.iconButton} aria-label={`Abrir pesquisa de ${research.process.number}`} title="Abrir pesquisa"><FileText /></Link>,
    }))} />;
}
