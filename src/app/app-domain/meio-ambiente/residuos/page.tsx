import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewWasteSheet } from "../components/NewWasteSheet";
import { WasteRowActions } from "../components/WasteRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listEnterpriseOptions, listWastes } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "generator", label: "Gerador / Empresa", type: "text", initialWidth: 260, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo de resíduo", type: "text", initialWidth: 190, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "quantity", label: "Quantidade (kg)", type: "text", initialWidth: 160, minWidth: 132, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "destination", label: "Destinação final", type: "text", initialWidth: 240, minWidth: 135, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Data do registro", type: "text", initialWidth: 150, minWidth: 135, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function ResiduosPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const wastes = await listWastes(context.database ?? db, searchParams);
  const enterprises = await listEnterpriseOptions(context.database ?? db);
  const list = filterAndPaginate(wastes, searchParams);
  const rows: OperationalRow[] = list.items.map((waste) => ({
    id: waste.id, label: waste.generatorName,
    values: { generator: waste.generatorName, type: waste.wasteType, quantity: `${waste.quantityKg.toLocaleString("pt-BR")} kg`, destination: waste.destination, date: new Date(waste.date).toLocaleDateString("pt-BR") },
    actions: <WasteRowActions waste={waste} enterprises={enterprises} />,
  }));
  return <OperationalListFrame label="Lista de resíduos" actions={<NewWasteSheet enterprises={enterprises} />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/residuos" values={searchParams} placeholder="Buscar registros..." filters={[{ name: "tipo", label: "Tipo", options: ["Organico", "Reciclavel", "Perigoso", "Eletronico"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/residuos" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-waste" caption="Controle de resíduos" emptyMessage="Nenhum registro de resíduo encontrado." />
  </OperationalListFrame>;
}
