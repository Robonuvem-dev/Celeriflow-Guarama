"use client";

import { useState } from "react";
import Link from "next/link";
import { OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

type Contract = { id: string; number: string; registration: string; scope: string; supplier: string; rubric: string; installments: { id: string; sequence: number; competence: string; amount: string; status: string }[] };
export function ConsignmentList({ contracts, page, total, query }: { contracts: Contract[]; page: number; total: number; query: string }) {
  const [selected, setSelected] = useState(contracts[0]?.id || "");
  const contract = contracts.find(item => item.id === selected) || contracts[0];
  return <PortalOperationalList key={contract?.id || "empty"} id="consignacoes-parcelas" label="Parcelas da consignação" actions={<><Link href="/portal-servidor/margem">Margem calculada</Link><Link href="/portal-servidor/credito">Solicitar crédito consignado</Link></>} toolbar={<>
    <form className={styles.searchForm}><input aria-label="Número do contrato" name="q" defaultValue={query} placeholder="Número do contrato" className={styles.searchInput} /><button className={styles.filterButton}>Filtrar</button></form>
    <select aria-label="Contrato de consignação" value={contract?.id || ""} onChange={event => setSelected(event.target.value)}><option value="" disabled>Selecione um contrato</option>{contracts.map(item => <option key={item.id} value={item.id}>{item.number} · {item.registration}</option>)}</select>
    <OperationalFilters label="Contratos e contexto"><OperationalLinkPagination page={page} total={total} values={{ q: query }} /><p>{total} contratos · parcela lançada na folha não comprova repasse à consignatária.</p>{contract && <dl className="grid gap-2">{[["Contrato", contract.number], ["Matrícula", contract.registration], ["Escopo", contract.scope], ["Consignatária", contract.supplier], ["Rubrica", contract.rubric]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</OperationalFilters>
  </>} columns={[portalColumn("sequence", "Parcela", 100, 75, "text", "right"), portalColumn("competence", "Competência", 160, 105), portalColumn("amount", "Valor BRL", 150, 110, "text", "right"), portalColumn("status", "Situação", 240, 140, "status")]} rows={(contract?.installments || []).map(item => ({ id: item.id, label: `${contract?.number} · parcela ${item.sequence}`, values: { sequence: String(item.sequence), competence: item.competence, amount: item.amount, status: item.status } }))} />;
}
