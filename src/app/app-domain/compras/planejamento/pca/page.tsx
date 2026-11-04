import Link from "next/link";
import { eq } from "drizzle-orm";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listInternalPhaseMonitoringItems } from "@/db/repositories/procurement/internal-phase-documents";
import { listPcaObjectives, listPlanningOriginBudget, listPurchasePlannings } from "@/db/repositories/procurement/purchase-planning";
import { departments } from "@/db/schema/administration";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import {
  consolidatePca,
  identifyCollectivePurchaseOpportunities,
  summarizeInternalPhaseMonitoring,
  summarizePcaBudget,
} from "@/lib/compras/pca-consolidation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function PcaPage({ searchParams }: {
  searchParams: Promise<{ exercicio?: string; unidade?: string; objetivo?: string }>;
}) {
  const context = await getTenantContextForModule("COMPRAS");
  const database = context.database ?? db;
  const { exercicio, unidade, objetivo } = await searchParams;
  const currentYear = Number(new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const year = typeof exercicio === "string" && /^\d{4}$/.test(exercicio) ? Number(exercicio) : currentYear;
  const [plannings, objectives, origins, monitoringItems] = await Promise.all([
    listPurchasePlannings(database),
    listPcaObjectives(database),
    database.select({ id: purchaseRequests.id, unitId: departments.id, unitName: departments.name })
      .from(purchaseRequests).leftJoin(departments, eq(departments.id, purchaseRequests.departmentId)),
    listInternalPhaseMonitoringItems(database, year),
  ]);
  const byRequest = new Map(origins.map(origin => [origin.id, origin]));
  const objectiveById = new Map(objectives.map(objective => [objective.id, objective]));
  const demands = plannings.map(planning => {
    const origin = planning.originPurchaseRequestId ? byRequest.get(planning.originPurchaseRequestId) : undefined;
    return {
      id: planning.id,
      year: planning.expectedPeriodStart.getUTCFullYear(),
      unitId: origin?.unitId ?? null,
      unitName: origin?.unitName ?? null,
      objectiveId: planning.objectiveId,
      catalogItemId: planning.catalogItemId,
      unit: planning.unit,
      quantity: planning.quantity,
      status: planning.status,
      expectedPeriodStart: planning.expectedPeriodStart.toISOString().slice(0, 10),
      expectedPeriodEnd: planning.expectedPeriodEnd.toISOString().slice(0, 10),
      description: planning.catalogItem?.name ?? planning.description ?? "Item sem especificação",
      estimatedValue: String(planning.estimatedValueDecimal),
    };
  });
  const units = consolidatePca(demands, year);
  const groups = consolidatePca(demands, year, unidade === "sem-unidade" ? "" : unidade || undefined, objetivo || undefined);
  const opportunities = identifyCollectivePurchaseOpportunities(demands, year);
  const monitoring = summarizeInternalPhaseMonitoring(monitoringItems);
  const requestByPlanning = new Map(plannings.map(planning => [planning.id, planning.originPurchaseRequestId]));
  const requestIds = [...new Set(groups.flatMap(group => group.demands.flatMap(demand => {
    const requestId = requestByPlanning.get(demand.id);
    return requestId ? [requestId] : [];
  })))];
  const budgetRows = await listPlanningOriginBudget(database, requestIds);
  const rowsByRequest = new Map<string, typeof budgetRows>();
  for (const row of budgetRows) {
    const rows = rowsByRequest.get(row.requestId) ?? [];
    rows.push(row);
    rowsByRequest.set(row.requestId, rows);
  }
  const budgetByRequest = new Map(requestIds.map(id => [id, summarizePcaBudget(rowsByRequest.get(id) ?? [])]));
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const reportQuery = new URLSearchParams({ exercicio: String(year) });
  if (unidade) reportQuery.set("unidade", unidade);
  if (objetivo) reportQuery.set("objetivo", objetivo);

  return (
    <PageFrame className="space-y-4">
      <PageHeader
        title="Consolidação do PCA e Acompanhamento da Fase Interna"
        action={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              className="rounded border px-3 py-1 font-medium hover:bg-muted"
              href={`/api/compras/planejamento/pca/relatorio?${reportQuery.toString()}`}
              target="_blank"
              rel="noreferrer"
            >
              Emitir Relatório Gerencial (HTML / Imprimir)
            </a>
            <a
              className="rounded border px-3 py-1 hover:bg-muted"
              href={`/api/compras/planejamento/pca/relatorio?${reportQuery.toString()}&formato=csv`}
            >
              Exportar CSV do PCA
            </a>
            <Link className="underline" href="/compras/planejamento">Voltar ao planejamento</Link>
          </div>
        }
      />
      <p className="text-sm">O exercício é o ano de início do período previsto. A unidade vem do departamento da solicitação de origem. As dotações exibem os valores da solicitação de origem e podem se repetir entre demandas da mesma solicitação. Esses valores não compõem o total estimado do PCA.</p>
      <form className="flex flex-wrap items-end gap-3">
        <label>Exercício <input name="exercicio" type="number" min={1000} max={9999} defaultValue={year} className="border px-2 py-1" /></label>
        <label>Unidade <select name="unidade" defaultValue={unidade ?? ""} className="border px-2 py-1">
          <option value="">Todas</option>
          {units.map(group => <option key={group.id} value={group.id || "sem-unidade"}>{group.name}</option>)}
        </select></label>
        <label>Objetivo do PPA <select name="objetivo" defaultValue={objetivo ?? ""} className="border px-2 py-1">
          <option value="">Todos</option>
          {objectives.map(objective => <option key={objective.id} value={objective.id}>{objective.code} · {objective.description}</option>)}
        </select></label>
        <button type="submit" className="rounded border px-3 py-1">Filtrar</button>
      </form>

      <section aria-label="Painel gerencial da fase interna" className="space-y-3 rounded border bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Acompanhamento Gerencial da Fase Interna ({year})</h2>
          <span className="text-xs text-muted-foreground">Lei nº 14.133/2021 · Art. 12, VII e Art. 18</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded border bg-background p-2.5">
            <p className="text-xs text-muted-foreground">Demandas no exercício</p>
            <p className="mt-1 font-semibold">{monitoring.totalDemands} · {money.format(monitoring.totalEstimatedValue.toNumber())}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Planejadas: {monitoring.byPlanningStatus.planejado} · Rascunho: {monitoring.byPlanningStatus.rascunho}
            </p>
          </div>
          <div className="rounded border bg-background p-2.5">
            <p className="text-xs text-muted-foreground">Documentos elaborados / aprovados</p>
            <p className="mt-1 font-semibold">
              DFD: {monitoring.documentsProgress.withDfd} ({monitoring.documentsProgress.dfdApproved} aprov.) · ETP: {monitoring.documentsProgress.withEtp} ({monitoring.documentsProgress.etpApproved} aprov.) · TR: {monitoring.documentsProgress.withTr} ({monitoring.documentsProgress.trApproved} aprov.)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Documentos vinculados ao GED: {monitoring.documentsProgress.gedLinkedTotal}
            </p>
          </div>
          <div className="rounded border bg-background p-2.5">
            <p className="text-xs text-muted-foreground">Coerência entre documentos (DFD ↔ PCA ↔ ETP ↔ TR)</p>
            <p className="mt-1 font-semibold">
              {monitoring.documentsProgress.coherentCount} coerente(s) · {monitoring.documentsProgress.inconsistentCount} com alerta(s)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verificação automática de valores, quantidades e vigência
            </p>
          </div>
          <div className="rounded border bg-background p-2.5">
            <p className="text-xs text-muted-foreground">Controle de prazos da fase interna</p>
            <p className="mt-1 font-semibold">
              No prazo: {monitoring.deadlines.onTrackCount} · Próx. 30 dias: {monitoring.deadlines.dueSoonCount} · Atrasados: {monitoring.deadlines.overdueCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monitoramento pelo início previsto da necessidade
            </p>
          </div>
        </div>
        {monitoring.deadlines.itemsWithAlert.length > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
            <p className="font-semibold">Alertas de prazo na fase interna ({monitoring.deadlines.itemsWithAlert.length}):</p>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              {monitoring.deadlines.itemsWithAlert.slice(0, 8).map(alert => (
                <li key={alert.planningId}>
                  <Link className="font-medium underline" href={`/compras/planejamento/${alert.planningId}`}>{alert.description}</Link>
                  {" "}({alert.unitName}) · Início previsto: {alert.expectedPeriodStart} · Etapa atual: {alert.currentStage} ·{" "}
                  <strong>{alert.alertLevel === "ATRASADO" ? "Prazo vencido" : "Vence em até 30 dias"}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-label="Oportunidades de compras coletivas" className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">Oportunidades de Compras Coletivas e Padronização ({year})</h2>
        <p className="text-xs text-muted-foreground">
          Agrupamento automático de itens ou serviços recorrentes para contratações compartilhadas e ganho de economia de escala (art. 12, VII e art. 40 da Lei nº 14.133/2021).
        </p>
        {opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade de compra coletiva identificada para o exercício selecionado.</p>
        ) : (
          <ul className="list-disc pl-5 space-y-2 text-sm">
            {opportunities.map(opportunity => (
              <li key={opportunity.key}>
                <span className="font-medium">{opportunity.label}</span> · Quantidade total:{" "}
                <strong>{opportunity.totalQuantity.toNumber()} {opportunity.unit}</strong> · Valor consolidado:{" "}
                <strong>{money.format(opportunity.totalEstimatedValue.toNumber())}</strong> ·{" "}
                {opportunity.unitCount} unidade(s) administrativa(s) ({opportunity.demandCount} demandas)
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {opportunity.units.map(u => (
                    <li key={u.unitId}>
                      {u.unitName}: {u.demandCount} demanda(s) · {u.quantity.toNumber()} {opportunity.unit} · {money.format(u.estimatedValue.toNumber())}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groups.length === 0 && <p>Nenhuma demanda para os filtros informados.</p>}
      {groups.map(group => <section key={group.id} className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">{group.name}</h2>
        <p>{group.demands.length} demanda(s) · {money.format(group.total.toNumber())}</p>
        <ul className="list-disc pl-5 space-y-2">
          {group.demands.map(demand => {
            const requestId = requestByPlanning.get(demand.id);
            const budget = requestId ? budgetByRequest.get(requestId) : undefined;
            const objective = demand.objectiveId ? objectiveById.get(demand.objectiveId) : undefined;
            return <li key={demand.id}>
              <Link className="underline font-medium" href={`/compras/planejamento/${demand.id}`}>{demand.description}</Link> · {money.format(Number(demand.estimatedValue))}
              {" "}· <Link className="text-xs underline text-emerald-700" href={`/compras/planejamento/${demand.id}?aba=etp`}>Elaborar ETP / TR</Link>
              <p className="text-sm">Objetivo do PPA: {objective ? `${objective.code} · ${objective.description}` : "Sem objetivo vinculado"}</p>
              <p className="text-sm">Alocação na solicitação de origem: {budget?.status ?? "Ausente — sem solicitação vinculada"}</p>
              {budget && budget.appropriations.length > 0 && <ul className="list-disc pl-5 text-sm">
                {budget.appropriations.map((allocation, index) => <li key={index}>
                  Dotação {allocation.code} · {money.format(allocation.amount.toNumber())}
                </li>)}
              </ul>}
            </li>;
          })}
        </ul>
      </section>)}
    </PageFrame>
  );
}
