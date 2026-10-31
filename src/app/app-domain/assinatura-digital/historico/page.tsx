import Link from "next/link";
import { db } from "@/db/client";
import { listMySignatureHistory } from "@/db/repositories/documents/signature-history";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getUnifiedSignatureContext } from "@/lib/documents/ged-access";

export const dynamic = "force-dynamic";

const columns: OperationalColumn[] = [
  { key: "title", label: "Documento", type: "text", initialWidth: 280, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 150, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "version", label: "Versão", type: "text", initialWidth: 70, minWidth: 60, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 120, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "provider", label: "Provedor", type: "text", initialWidth: 120, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "signedAt", label: "Assinado em", type: "text", initialWidth: 170, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "updatedAt", label: "Atualizado em", type: "text", initialWidth: 170, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Validação", type: "actions", initialWidth: 90, minWidth: 90, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];
const statuses: Record<string, string> = { SIGNED: "Assinada", REJECTED: "Recusada", CANCELLED: "Cancelada" };

export default async function SignatureHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getUnifiedSignatureContext();
  const params = await searchParams;
  const list = await listMySignatureHistory(context.database ?? db, context.user.id, Number(params.page), typeof params.q === "string" ? params.q : "");
  return <OperationalListFrame label="Meu histórico de assinaturas"
    toolbar={<form className={styles.searchForm} action="/assinatura-digital/historico"><input type="search" className={styles.searchInput} name="q" aria-label="Buscar no histórico de assinaturas" placeholder="Buscar documento ou tipo…" defaultValue={list.query} /><button className={styles.filterButton}>Buscar</button>{list.query && <Link className={styles.filterButton} href="/assinatura-digital/historico">Limpar</Link>}</form>}
    pagination={<OperationalLinkPagination page={list.page} total={list.total} pathname="/assinatura-digital/historico" values={{ q: list.query }} />}>
    <OperationalTable columns={columns} preferenceId="assinatura-digital-historico" caption="Histórico das minhas assinaturas" emptyMessage="Nenhuma assinatura encontrada para esta busca." rows={list.records.map(record => ({
      id: record.id, label: record.title,
      values: { title: record.title, type: record.documentType, version: String(record.version), status: statuses[record.status] ?? record.status, provider: record.provider === "INTERNAL" ? "Interno" : record.provider, signedAt: record.signedAt?.toLocaleString("pt-BR") ?? "—", updatedAt: record.updatedAt.toLocaleString("pt-BR") },
      actions: record.validationCode ? <div className={styles.rowActions}><Link className={styles.filterButton} style={{ height: 24 }} href={`/validar-documento/${encodeURIComponent(record.validationCode)}`} target="_blank" rel="noopener noreferrer" aria-label={`Validar ${record.title}`}>Validar</Link></div> : "—",
    }))} />
  </OperationalListFrame>;
}
