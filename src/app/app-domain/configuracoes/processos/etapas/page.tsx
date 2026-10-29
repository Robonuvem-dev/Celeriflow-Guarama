import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readProcessConfiguration } from "@/db/repositories/processes/configuration";
import { deleteProcessWorkflowStage } from "../actions";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

const columns: OperationalColumn[] = [
  { key: "type", label: "Tipo de processo", type: "text", initialWidth: 210, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "subject", label: "Assunto", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "position", label: "Ordem", type: "identifier", initialWidth: 70, minWidth: 60, maxWidth: 100, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "label", label: "Etapa", type: "text", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "department", label: "Setor", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "sla", label: "SLA", type: "text", initialWidth: 100, minWidth: 80, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 85, minWidth: 80, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];

export default async function ProcessWorkflowStagesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await getTenantContextForModule("CONFIGURACOES");
  const { q = "", page: pageParam = "1" } = await searchParams;
  const { legacyStages } = await readProcessConfiguration(db);
  const search = q.trim().toLowerCase();
  const filtered = legacyStages.filter((stage) => [stage.processType.name, stage.subject?.name, stage.label, stage.department.name].some((value) => value?.toLowerCase().includes(search)));
  const pages = Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(pageParam)) || 1), pages);
  const rows = filtered.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE);

  return <OperationalListFrame label="Fluxo legado por tipo e assunto"
    actions={<Link href="/configuracoes/processos" className={styles.newButton}>Configurar tipos e fluxos</Link>}
    toolbar={<form method="get" className={styles.searchForm}><input name="q" type="search" aria-label="Buscar fluxo, etapa ou setor" defaultValue={q} placeholder="Buscar fluxo, etapa ou setor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button><Link href="/configuracoes/processos/etapas" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={page} total={filtered.length} pathname="/configuracoes/processos/etapas" values={{ q }} />}>
    <OperationalTable columns={columns} preferenceId="configuracoes-processos-etapas" caption="Etapas do fluxo legado por tipo e assunto" emptyMessage="Nenhuma etapa encontrada." rows={rows.map((stage) => ({
      id: stage.id, label: stage.label || `Etapa ${stage.position}`,
      values: { type: stage.processType.name, subject: stage.subject?.name || "Fluxo geral do tipo", position: String(stage.position), label: stage.label || "Sem nome", department: stage.department.name, sla: stage.slaDays ? `${stage.slaDays} dias` : "Sem SLA" },
      actions: <form action={deleteProcessWorkflowStage}><input type="hidden" name="id" value={stage.id} /><button className="h-6 px-1 text-red-700" aria-label={`Excluir etapa ${stage.label || stage.position}`}>Excluir</button></form>,
    }))} />
  </OperationalListFrame>;
}
