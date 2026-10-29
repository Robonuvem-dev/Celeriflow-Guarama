import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewGreenAreaSheet } from "../components/NewGreenAreaSheet";
import { GreenAreaRowActions } from "../components/GreenAreaRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listGreenAreas } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "name", label: "Nome da área", type: "text", initialWidth: 260, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 160, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "size", label: "Tamanho (m²)", type: "text", initialWidth: 140, minWidth: 120, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "location", label: "Localização", type: "text", initialWidth: 240, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Conservação", type: "status", initialWidth: 160, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function AreasVerdesPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const greenAreas = await listGreenAreas(context.database ?? db, searchParams);
  const list = filterAndPaginate(greenAreas, searchParams);
  const rows: OperationalRow[] = list.items.map((area) => ({
    id: area.id, label: area.name,
    values: { name: area.name, type: area.areaType, size: area.sizeSqm?.toLocaleString("pt-BR") ?? "—", location: area.location || "—", status: area.status },
    actions: <GreenAreaRowActions area={area} />,
  }));
  return <OperationalListFrame label="Lista de áreas verdes" actions={<NewGreenAreaSheet />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/areas-verdes" values={searchParams} placeholder="Buscar área verde..." filters={[{ name: "status", label: "Conservação", options: ["Preservado", "Em Recuperacao", "Degradado", "Monitorado"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/areas-verdes" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-green-areas" caption="Áreas verdes e preservação" emptyMessage="Nenhuma área verde cadastrada." />
  </OperationalListFrame>;
}
