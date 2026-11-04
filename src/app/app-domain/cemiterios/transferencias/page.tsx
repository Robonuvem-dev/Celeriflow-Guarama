import Link from "next/link";
import { db } from "@/db/client";
import { readCemeteryTransferPage } from "@/db/repositories/cemeteries/workflow-pages";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { WorkflowTransferForm } from "@/components/cemeteries/WorkflowForms";
import { WORKFLOW_MOVEMENT_LABELS } from "@/lib/cemeteries/workflow-labels";

export const dynamic = "force-dynamic";
type Filters = { page?: string; q?: string; type?: string; cemeteryId?: string };

export default async function CemeteryTransfersPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams;
  const context = await getTenantContextForModule("CEMITERIOS");
  const { total, page, rows, graves, operators } = await readCemeteryTransferPage(context.database ?? db, filters);
  const graveNames = new Map(graves.map((grave) => [grave.id, `${grave.code} · ${grave.cemetery.name}`]));
  const operatorNames = new Map(operators.map((operator) => [operator.id, operator.nome]));
  const values = { q: filters.q || "", type: filters.type || "", cemeteryId: filters.cemeteryId || "" };
  const href = (next: number) => `/cemiterios/transferencias?${new URLSearchParams({ ...values, page: String(next) })}`;

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Gestão de Cemitérios (CF33)</p>
            <h1 className="text-xl font-bold text-slate-900">Transferências, exumações e remoções</h1>
            <p className="mt-1 text-xs text-slate-600">
              Controle de movimentações funerárias internas e externas com registro de origem, destino, ossuário e responsável.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPerformModuleOperation(context.user, "CEMITERIOS", "create") && (
              <Link className="cf-portal-btn" href="/cemiterios/processos?view=novo&entradaExterna=1">
                Registrar entrada externa
              </Link>
            )}
            <Link className="cf-portal-btn-secondary" href="/cemiterios/processos">Processos funerários</Link>
            <Link className="cf-portal-btn-secondary" href="/cemiterios">← Cemitérios</Link>
          </div>
        </div>
      </header>

      <form action="/cemiterios/transferencias" method="get" className="cf-portal-form flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <label className="min-w-56 flex-1">
          Pessoa falecida
          <input name="q" defaultValue={filters.q} placeholder="Nome da pessoa" className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="min-w-48">
          Tipo de movimentação
          <select className="mt-1 w-full rounded-lg border border-slate-300 p-2" name="type" defaultValue={filters.type || ""}>
            <option value="">Todos os tipos</option>
            {Object.entries(WORKFLOW_MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button className="cf-portal-btn">Filtrar</button>
      </form>

      <section className="grid gap-3">
        {rows.map((row) => (
          <article key={row.id} className="cf-portal-card text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {row.deceased?.fullName} · {WORKFLOW_MOVEMENT_LABELS[row.movementType] || row.movementType}
              </h2>
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                {row.movementDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </span>
            </div>
            <p className="mt-1.5 text-slate-700">
              <strong>Origem:</strong> {graveNames.get(row.fromGraveId || "") || row.fromGraveId || "—"} · <strong>Destino:</strong>{" "}
              {row.toOssuary?.code || (row.toGraveId ? graveNames.get(row.toGraveId) : row.destinationDescription) || "—"}
            </p>
            <p className="mt-1 text-slate-500">
              <strong>Operador:</strong> {operatorNames.get(row.createdByUsuarioId) || row.createdByUsuarioId}
              {row.notes ? ` · Observações: ${row.notes}` : ""}
            </p>
          </article>
        ))}
        {!rows.length && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
            Nenhuma movimentação encontrada para os filtros selecionados.
          </p>
        )}
      </section>

      <ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/cemiterios/transferencias", values }} />

      {canPerformModuleOperation(context.user, "CEMITERIOS", "update") && (
        <section className="cf-portal-card">
          <WorkflowTransferForm />
        </section>
      )}
    </main>
  );
}
