import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCentralSignatureRecords } from "@/lib/signatures/central-service";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import RecordActions from "./RecordActions";
import { selectRecords } from "./records";

export const dynamic = "force-dynamic";

const columns: OperationalColumn[] = [
  { key: "filename", label: "Documento", type: "text", initialWidth: 230, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 140, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "signer", label: "Assinador", type: "text", initialWidth: 190, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "method", label: "Método", type: "text", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "signedAt", label: "Assinado em", type: "text", initialWidth: 165, minWidth: 125, resizable: true, sortable: false, details: "overflow" },
  { key: "expiresAt", label: "Original expira em", type: "text", initialWidth: 165, minWidth: 125, resizable: true, sortable: false, details: "overflow" },
  { key: "storage", label: "Original", type: "status", initialWidth: 125, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 85, minWidth: 85, maxWidth: 85, resizable: false, sortable: false, details: "none" },
];

export default async function SignatureRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  // O serviço aplica o escopo do ator/assinador/administrador. Não truncar antes da busca.
  const records = await listCentralSignatureRecords(context);
  const list = selectRecords(records, q, Number(params.page));
  // Página dinâmica de servidor: a disponibilidade depende do instante da requisição.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <OperationalListFrame label="Registros de assinatura"
    toolbar={<><form className={styles.searchForm} action="/assinatura-digital/registros"><input type="search" className={styles.searchInput} name="q" aria-label="Buscar registros de assinatura" placeholder="Documento, assinador, código ou hash…" defaultValue={q} /><button className={styles.filterButton}>Buscar</button>{q && <Link className={styles.filterButton} href="/assinatura-digital/registros">Limpar</Link>}</form><span className="text-[13px]" title="O comprovante e a validação permanecem após o prazo.">Blob privado: 90 dias · Comprovante preservado</span></>}
    pagination={<OperationalLinkPagination page={list.page} total={list.total} pathname="/assinatura-digital/registros" values={{ q }} />}>
    <OperationalTable columns={columns} preferenceId="assinatura-digital-registros" caption="Registros de assinatura — original privado por 90 dias; comprovante permanece após expiração" emptyMessage="Nenhum registro de assinatura encontrado." rows={list.records.map(record => ({
      id: record.id, label: record.filename,
      values: { filename: record.filename, type: record.documentTypeName, signer: record.signerName, method: record.method === "INTERNAL" ? "Interna" : record.method === "A1_ECPF" ? "A1 e-CPF" : "A1 e-CNPJ", signedAt: new Date(record.signedAt).toLocaleString("pt-BR"), expiresAt: new Date(record.expiresAt).toLocaleString("pt-BR"), storage: record.storageDeletedAt ? "Excluído" : Date.parse(record.expiresAt) <= now ? "Expirado" : "Disponível" },
      actions: <div className={styles.rowActions}><RecordActions record={record} /></div>,
    }))} />
  </OperationalListFrame>;
}
