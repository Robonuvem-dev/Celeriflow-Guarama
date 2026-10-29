import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewEnterpriseSheet } from "../components/NewEnterpriseSheet";
import { EnterpriseRowActions } from "../components/EnterpriseRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listEnterprises } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "name", label: "Razão social / Nome", type: "text", initialWidth: 280, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "document", label: "CNPJ/CPF", type: "identifier", initialWidth: 190, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "activity", label: "Atividade", type: "text", initialWidth: 240, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "risk", label: "Risco", type: "status", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function EmpreendimentosPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const enterprises = await listEnterprises(context.database ?? db, searchParams);
  const list = filterAndPaginate(enterprises, searchParams);
  const rows: OperationalRow[] = list.items.map((enterprise) => ({
    id: enterprise.id, label: enterprise.name,
    values: { name: enterprise.name, document: enterprise.cnpjCpf || "—", activity: enterprise.activityType || "—", risk: enterprise.potentialRisk || "Baixo", status: enterprise.status },
    actions: <EnterpriseRowActions enterprise={enterprise} />,
  }));
  return <OperationalListFrame label="Lista de empreendimentos" actions={<NewEnterpriseSheet />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/empreendimentos" values={searchParams} placeholder="Buscar empreendimento..." filters={[
      { name: "risco", label: "Risco", options: ["Alto", "Medio", "Baixo"] },
      { name: "status", label: "Status", options: ["Ativo", "Inativo", "Irregular", "Embargado"] },
    ]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/empreendimentos" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-enterprises" caption="Empreendimentos" emptyMessage="Nenhum empreendimento cadastrado." />
  </OperationalListFrame>;
}
