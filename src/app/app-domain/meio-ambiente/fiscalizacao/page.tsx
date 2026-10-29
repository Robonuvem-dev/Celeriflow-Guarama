import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewInspectionSheet } from "../components/NewInspectionSheet";
import { InspectionRowActions } from "../components/InspectionRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listEnterpriseOptions, listInspections } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "date", label: "Data agendada", type: "text", initialWidth: 190, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "inspector", label: "Fiscal responsável", type: "text", initialWidth: 200, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "enterprise", label: "Empreendimento", type: "text", initialWidth: 230, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "notes", label: "Observações", type: "text", initialWidth: 260, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function FiscalizacaoPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const inspections = await listInspections(context.database ?? db, searchParams);
  const enterprises = await listEnterpriseOptions(context.database ?? db);
  const list = filterAndPaginate(inspections, searchParams);
  const rows: OperationalRow[] = list.items.map((inspection) => ({
    id: inspection.id, label: inspection.inspector || inspection.id,
    values: { date: inspection.dateScheduled ? new Date(inspection.dateScheduled).toLocaleString("pt-BR") : "—", inspector: inspection.inspector || "—", enterprise: inspection.enterprise?.name ?? "Nenhum", status: inspection.status, notes: inspection.notes || "—" },
    actions: <InspectionRowActions inspection={inspection} enterprises={enterprises} />,
  }));
  return <OperationalListFrame label="Lista de vistorias" actions={<NewInspectionSheet enterprises={enterprises} />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/fiscalizacao" values={searchParams} placeholder="Buscar vistoria..." filters={[{ name: "status", label: "Status", options: ["Agendada", "Em Andamento", "Realizada", "Cancelada"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/fiscalizacao" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-inspections" caption="Fiscalização e vistorias" emptyMessage="Nenhuma vistoria agendada." />
  </OperationalListFrame>;
}
