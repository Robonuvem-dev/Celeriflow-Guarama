import { ShieldCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { RunConsistencyButton } from "./RunConsistencyButton";
import { IdentityReconciliationForm } from "./IdentityReconciliationForm";
import { QualityList } from "./QualityList";
import { db } from "@/db/client";
import { loadConsistencyIssues, loadConsistencyRuns } from "@/db/repositories/registry/overview";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export const dynamic = "force-dynamic";
function firstParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function QualidadePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(firstParam(params.page) || "1", 10) || 1);
  const { database, user } = await getTenantContextForModule("CADASTROS");
  const { runs, selectedRun } = await loadConsistencyRuns(database ?? db, firstParam(params.run));
  const runId = selectedRun?.id;
  let result = await loadConsistencyIssues(database ?? db, runId || "__none__", requestedPage);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(result.total / OPERATIONAL_PAGE_SIZE)));
  if (page !== requestedPage) result = await loadConsistencyIssues(database ?? db, runId || "__none__", page);
  return <PageFrame className="flex h-full min-h-0 flex-col">
    <PageHeader title="Qualidade dos Dados" icon={<ShieldCheck className="size-4" />} />
    <QualityList page={page} total={result.total} runId={runId} actions={<RunConsistencyButton />} toolbar={<>
      <form className={styles.searchForm} action="/cadastros/qualidade"><label className={styles.srOnly} htmlFor="quality-run">Execução</label><select id="quality-run" name="run" defaultValue={runId} className={styles.searchInput}>{runId && !runs.some(run => run.id === runId) && <option value={runId}>Execução histórica selecionada · {result.total} achados</option>}{runs.map(run => <option key={run.id} value={run.id}>{run.startedAt.toLocaleString("pt-BR")} · {run._count.issues} achados · {run.status}</option>)}</select><button className={styles.filterButton}>Consultar execução</button></form>
      {canPerformModuleOperation(user, "CADASTROS", "update") && <OperationalFilters label="Reconciliar identidade"><IdentityReconciliationForm /></OperationalFilters>}
    </>} rows={result.issues.map(issue => ({ id: issue.id, label: issue.recordId, values: { severity: issue.severity, type: issue.issueType, recordType: issue.recordType, recordId: issue.recordId, description: issue.description, status: issue.status, detected: issue.detectedAt.toLocaleDateString("pt-BR") } }))} />
  </PageFrame>;
}
