import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewEduProgramSheet } from "../components/NewEduProgramSheet";
import { EduProgramRowActions } from "../components/EduProgramRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listEducationPrograms } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "title", label: "Título da ação", type: "text", initialWidth: 260, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "audience", label: "Público-alvo", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "start", label: "Início", type: "text", initialWidth: 110, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "end", label: "Fim", type: "text", initialWidth: 110, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "participants", label: "Participantes", type: "text", initialWidth: 140, minWidth: 116, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function EducacaoAmbientalPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const programs = await listEducationPrograms(context.database ?? db, searchParams);
  const list = filterAndPaginate(programs, searchParams);
  const rows: OperationalRow[] = list.items.map((program) => ({
    id: program.id, label: program.title,
    values: { title: program.title, audience: program.targetAudience || "—", start: new Date(program.startDate).toLocaleDateString("pt-BR"), end: program.endDate ? new Date(program.endDate).toLocaleDateString("pt-BR") : "—", participants: program.participantsCount?.toLocaleString("pt-BR") ?? "—", status: program.status },
    actions: <EduProgramRowActions program={program} />,
  }));
  return <OperationalListFrame label="Lista de ações de educação ambiental" actions={<NewEduProgramSheet />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/educacao" values={searchParams} placeholder="Buscar campanhas..." filters={[{ name: "status", label: "Status", options: ["Planejado", "Em Execucao", "Concluido", "Cancelado"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/educacao" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-education" caption="Educação ambiental" emptyMessage="Nenhuma ação educativa registrada." />
  </OperationalListFrame>;
}
