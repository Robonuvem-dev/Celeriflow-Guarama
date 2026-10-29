import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Pencil, CheckCircle, XCircle, Plus } from "lucide-react";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listRequests } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

const columns: readonly OperationalColumn[] = [
  { key: "type", label: "Tipo", type: "text", initialWidth: 180, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "requester", label: "Solicitante", type: "text", initialWidth: 230, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "address", label: "Endereço / Local", type: "text", initialWidth: 260, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Data", type: "text", initialWidth: 110, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 96, minWidth: 96, maxWidth: 96, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function SolicitacoesPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const requests = await listRequests(context.database ?? db, searchParams);
  const list = filterAndPaginate(requests, searchParams);
  const rows: OperationalRow[] = list.items.map((request) => ({
    id: request.id, label: request.requestType,
    values: { type: request.requestType, requester: request.requesterName || "—", address: request.address || "—", status: request.status, date: new Date(request.createdAt).toLocaleDateString("pt-BR") },
    // Estes controles já não tinham handlers na origem; manter seu contrato visual.
    actions: <div className={styles.rowActions}>
      <button type="button" className={styles.iconButton} title="Editar" aria-label={`Editar solicitação ${request.requestType}`}><Pencil /></button>
      <button type="button" className={styles.iconButton} title="Autorizar" aria-label={`Autorizar solicitação ${request.requestType}`}><CheckCircle /></button>
      <button type="button" className={styles.iconButton} title="Negar" aria-label={`Negar solicitação ${request.requestType}`}><XCircle /></button>
    </div>,
  }));
  return <OperationalListFrame label="Lista de solicitações ambientais" actions={<button type="button" className={styles.newButton} aria-label="Nova Solicitação" title="Nova Solicitação"><Plus /><span className={styles.newLabel}>Nova Solicitação</span></button>}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/solicitacoes" values={searchParams} placeholder="Buscar solicitação..." filters={[
      { name: "tipo", label: "Tipo", options: ["Poda", "Supressão", "Análise de Projeto"] },
      { name: "status", label: "Status", options: ["Pendente", "Em Análise", "Autorizado", "Negado"] },
    ]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/solicitacoes" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-requests" caption="Solicitações e podas" emptyMessage="Nenhuma solicitação registrada." />
  </OperationalListFrame>;
}
