import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewComplaintSheet } from "../components/NewComplaintSheet";
import { ComplaintRowActions } from "../components/ComplaintRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listComplaints } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "type", label: "Tipo", type: "text", initialWidth: 160, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "description", label: "Descrição", type: "text", initialWidth: 280, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "address", label: "Endereço", type: "text", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "anonymous", label: "Anônima", type: "text", initialWidth: 100, minWidth: 86, maxWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 130, minWidth: 95, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Data", type: "text", initialWidth: 110, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function DenunciasPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const complaints = await listComplaints(context.database ?? db, searchParams);
  const list = filterAndPaginate(complaints, searchParams);
  const rows: OperationalRow[] = list.items.map((complaint) => ({
    id: complaint.id, label: complaint.complaintType,
    values: { type: complaint.complaintType, description: complaint.description, address: complaint.address || "—", anonymous: complaint.isAnonymous ? "Sim" : "Não", status: complaint.status, date: new Date(complaint.createdAt).toLocaleDateString("pt-BR") },
    actions: <ComplaintRowActions complaint={complaint} />,
  }));
  return <OperationalListFrame label="Lista de denúncias ambientais" actions={<NewComplaintSheet />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/denuncias" values={searchParams} placeholder="Buscar denúncia..." filters={[{ name: "status", label: "Status", options: ["Recebida", "Em Triagem", "Em Vistoria", "Encerrada"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/denuncias" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-complaints" caption="Denúncias ambientais" emptyMessage="Nenhuma denúncia registrada." />
  </OperationalListFrame>;
}
