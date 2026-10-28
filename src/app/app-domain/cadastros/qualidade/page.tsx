import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { RunConsistencyButton } from "./RunConsistencyButton";
import { IdentityReconciliationForm } from "./IdentityReconciliationForm";
import { db } from "@/db/client";
import { loadConsistencyIssues, loadConsistencyRuns } from "@/db/repositories/registry/overview";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function QualidadePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(firstParam(params.page) || "1", 10) || 1);
  const requestedRunId = firstParam(params.run);
  const { database, user } = await getTenantContextForModule("CADASTROS");
  const { runs, selectedRun } = await loadConsistencyRuns(database ?? db, requestedRunId);
  const runId = selectedRun?.id;
  const { issues, total } = await loadConsistencyIssues(database ?? db, runId || "__none__", page);
  const runQuery = runId ? `&run=${encodeURIComponent(runId)}` : "";

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader title="Qualidade dos Dados" icon={<ShieldCheck className="size-4 text-emerald-700" />} action={<RunConsistencyButton />} />
      {canPerformModuleOperation(user, "CADASTROS", "update") && <IdentityReconciliationForm />}
      <div className="mb-2 flex gap-2 overflow-x-auto">
        {runs.map((run) => (
          <Link key={run.id} href={`/cadastros/qualidade?run=${run.id}`} className={`min-w-40 rounded border bg-white px-3 py-2 text-xs ${run.id === runId ? "border-emerald-500" : "border-slate-200"}`}>
            <p className="font-semibold text-slate-700">{run.startedAt.toLocaleString("pt-BR")}</p>
            <p className="mt-0.5 text-slate-500">{run._count.issues} achados · {run.status}</p>
          </Link>
        ))}
        {!runs.length && <p className="text-xs text-slate-500">Nenhuma verificação executada.</p>}
      </div>
      <ErpListFrame
        summary={<div className="flex gap-4 text-[11px] text-slate-500"><span>Achados da execução selecionada, sem conteúdo pessoal sensível</span><span>Gravidades: alta e média</span></div>}
        pagination={<ErpPagination page={page} total={total} previousHref={`/cadastros/qualidade?page=${page - 1}${runQuery}`} nextHref={`/cadastros/qualidade?page=${page + 1}${runQuery}`} label="achados" jumpTo={{ pathname: "/cadastros/qualidade", values: runId ? { run: runId } : undefined }} />}
      >
        <table className="w-full table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-600">
            <tr><th className="h-8 w-24 px-3">Gravidade</th><th className="h-8 px-3">Tipo</th><th className="h-8 px-3">Registro</th><th className="h-8 px-3">Descrição</th><th className="h-8 w-28 px-3">Status</th><th className="h-8 w-36 px-3">Detectado</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {issues.map((issue) => (
              <tr key={issue.id} className="hover:bg-slate-50">
                <td className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${issue.severity === "ALTA" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{issue.severity}</span></td>
                <td className="truncate px-3 py-1.5 text-slate-700">{issue.issueType}</td>
                <td className="truncate px-3 py-1.5 text-slate-600">{issue.recordType} · {issue.recordId}</td>
                <td className="truncate px-3 py-1.5 text-slate-600">{issue.description}</td>
                <td className="px-3 py-1.5 text-slate-600">{issue.status}</td>
                <td className="px-3 py-1.5 text-slate-500">{issue.detectedAt.toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!issues.length && <p className="p-6 text-center text-xs text-slate-500">Nenhuma inconsistência encontrada.</p>}
      </ErpListFrame>
    </PageFrame>
  );
}
