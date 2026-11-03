import Link from "next/link";
import { eq } from "drizzle-orm";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listPlanningOriginBudget, listPurchasePlannings } from "@/db/repositories/procurement/purchase-planning";
import { departments } from "@/db/schema/administration";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import { consolidatePca, summarizePcaBudget } from "@/lib/compras/pca-consolidation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function PcaPage({ searchParams }: {
  searchParams: Promise<{ exercicio?: string; unidade?: string }>;
}) {
  const context = await getTenantContextForModule("COMPRAS");
  const database = context.database ?? db;
  const { exercicio, unidade } = await searchParams;
  const currentYear = Number(new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const year = typeof exercicio === "string" && /^\d{4}$/.test(exercicio) ? Number(exercicio) : currentYear;
  const [plannings, origins] = await Promise.all([
    listPurchasePlannings(database),
    database.select({ id: purchaseRequests.id, unitId: departments.id, unitName: departments.name })
      .from(purchaseRequests).leftJoin(departments, eq(departments.id, purchaseRequests.departmentId)),
  ]);
  const byRequest = new Map(origins.map(origin => [origin.id, origin]));
  const demands = plannings.map(planning => {
    const origin = planning.originPurchaseRequestId ? byRequest.get(planning.originPurchaseRequestId) : undefined;
    return {
      id: planning.id,
      year: planning.expectedPeriodStart.getUTCFullYear(),
      unitId: origin?.unitId ?? null,
      unitName: origin?.unitName ?? null,
      description: planning.catalogItem?.name ?? planning.description ?? "Item sem especificação",
      estimatedValue: String(planning.estimatedValueDecimal),
    };
  });
  const units = consolidatePca(demands, year);
  const groups = consolidatePca(demands, year, unidade === "sem-unidade" ? "" : unidade || undefined);
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
  return (
    <PageFrame className="space-y-4">
      <PageHeader title="Consolidação do PCA" action={<Link className="underline" href="/compras/planejamento">Voltar ao planejamento</Link>} />
      <p className="text-sm">O exercício é o ano de início do período previsto. A unidade vem do departamento da solicitação de origem. As dotações exibem os valores da solicitação de origem e podem se repetir entre demandas da mesma solicitação. Esses valores não compõem o total estimado do PCA.</p>
      <form className="flex flex-wrap items-end gap-3">
        <label>Exercício <input name="exercicio" type="number" min={1000} max={9999} defaultValue={year} className="border" /></label>
        <label>Unidade <select name="unidade" defaultValue={unidade ?? ""} className="border">
          <option value="">Todas</option>
          {units.map(group => <option key={group.id} value={group.id || "sem-unidade"}>{group.name}</option>)}
        </select></label>
        <button type="submit" className="rounded border px-3 py-1">Filtrar</button>
      </form>
      {groups.length === 0 && <p>Nenhuma demanda para os filtros informados.</p>}
      {groups.map(group => <section key={group.id} className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">{group.name}</h2>
        <p>{group.demands.length} demanda(s) · {money.format(group.total.toNumber())}</p>
        <ul className="list-disc pl-5">
          {group.demands.map(demand => {
            const requestId = requestByPlanning.get(demand.id);
            const budget = requestId ? budgetByRequest.get(requestId) : undefined;
            return <li key={demand.id}>
            <Link className="underline" href={`/compras/planejamento/${demand.id}`}>{demand.description}</Link> · {money.format(Number(demand.estimatedValue))}
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
