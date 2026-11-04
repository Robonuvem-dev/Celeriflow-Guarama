import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canPerformModuleOperation, canViewModule, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { MaterialRequestWorkflowClient } from "./MaterialRequestWorkflowClient";
import { and, asc, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";
import { materialRequests, materialRequestItems } from "@/db/schema/assets-requests";
import { materials, materialMovements, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { departments, employees } from "@/db/schema/administration";
import { modules } from "@/db/schema/identity";
import { RecordHistoryPanel } from "../../_components/RecordHistoryPanel";
import { operationalColumns } from "../../_components/operational-columns";
import { reviseRequestAction } from "../revision-action";

export default async function RequisicaoMaterialDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let requestedId = routeId;
  try { requestedId = decodeURIComponent(routeId); } catch { requestedId = routeId; }
  const { user } = await getTenantContextForModule("PATRIMONIO");
  const approvers = alias(employees, "request_approvers"), issuers = alias(employees, "request_issuers");
  const baseQuery = () =>
    db.select({
      request: materialRequests,
      department: { name: departments.name, secretariatId: departments.secretariatId },
      requester: { name: employees.name },
      sourceWarehouse: { name: warehouses.name },
      approvedByEmployee: { name: approvers.name },
      issuedByEmployee: { name: issuers.name },
    })
      .from(materialRequests)
      .innerJoin(departments, eq(departments.id, materialRequests.departmentId))
      .innerJoin(employees, eq(employees.id, materialRequests.requesterId))
      .leftJoin(warehouses, eq(warehouses.id, materialRequests.sourceWarehouseId))
      .leftJoin(approvers, eq(approvers.id, materialRequests.approvedByEmployeeId))
      .leftJoin(issuers, eq(issuers.id, materialRequests.issuedByEmployeeId));

  const isPlaceholder = requestedId === "[id]" || requestedId.toLowerCase() === "id";
  let [loaded] = !isPlaceholder
    ? await baseQuery().where(or(eq(materialRequests.id, requestedId), eq(materialRequests.number, requestedId))).limit(1)
    : [];
  if (!loaded) {
    [loaded] = await baseQuery().orderBy(desc(materialRequests.date), desc(materialRequests.createdAt)).limit(1);
  }
  const recentRequests = await db
    .select({ id: materialRequests.id, number: materialRequests.number, status: materialRequests.status })
    .from(materialRequests)
    .orderBy(desc(materialRequests.date), desc(materialRequests.createdAt))
    .limit(12);

  if (!loaded) {
    return (
      <PageFrame className="min-h-0 max-w-6xl flex-1 space-y-4 overflow-y-auto p-4">
        <PageHeader
          title="Requisição de Materiais"
          action={<Link href="/patrimonio/requisicoes" className="cf-portal-btn-secondary">Voltar à listagem de requisições</Link>}
        />
        <section className="cf-portal-card">
          <p className="text-sm text-slate-600">
            Não há requisições de materiais cadastradas no momento ou o identificador informado (<code>{requestedId}</code>) não possui registro vinculado. Utilize a tela de requisições para registrar uma nova solicitação de almoxarifado.
          </p>
          <div className="mt-3">
            <Link href="/patrimonio/requisicoes" className="cf-portal-btn">Ir para Requisições de Materiais</Link>
          </div>
        </section>
      </PageFrame>
    );
  }

  const id = loaded.request.id;
  const items = await db.select({ item: materialRequestItems, material: { id: materials.id, code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(materialRequestItems)
    .innerJoin(materials, eq(materials.id, materialRequestItems.materialId)).where(eq(materialRequestItems.requestId, id)).orderBy(asc(materialRequestItems.createdAt));
  const movements = items.length ? await db.select({ movement: materialMovements, warehouse: { name: warehouses.name }, stock: { id: materialStocks.id, batchNumber: materialStocks.batchNumber } }).from(materialMovements)
    .innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId)).leftJoin(materialStocks, eq(materialStocks.id, materialMovements.stockId)).where(inArray(materialMovements.materialRequestItemId, items.map(row => row.item.id))).orderBy(desc(materialMovements.date)) : [];
  const request = { ...loaded.request, department: loaded.department, requester: loaded.requester, sourceWarehouse: loaded.sourceWarehouse, approvedByEmployee: loaded.approvedByEmployee, issuedByEmployee: loaded.issuedByEmployee,
    items: items.map(row => ({ ...row.item, material: row.material, movements: movements.filter(movement => movement.movement.materialRequestItemId === row.item.id).map(movement => ({ ...movement.movement, warehouse: movement.warehouse, stock: movement.stock })) })) };
  const materialIds = request.items.map(item => item.materialId);
  const stocks = materialIds.length > 0 ? await db.select({ id: materialStocks.id, materialId: materialStocks.materialId, quantity: materialStocks.quantity, batchNumber: materialStocks.batchNumber, expirationDate: materialStocks.expirationDate, warehouse: { name: warehouses.name } }).from(materialStocks).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId))
    .where(and(inArray(materialStocks.materialId, materialIds), gt(materialStocks.quantity, 0), eq(warehouses.isActive, true), request.sourceWarehouseId ? eq(materialStocks.warehouseId, request.sourceWarehouseId) : undefined, isNull(materialStocks.blockedAt), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date()))))
    .orderBy(sql`${materialStocks.expirationDate} ASC NULLS LAST`, asc(materialStocks.batchNumber)) : [];
  const canQueryBudgetUnits = isSystemAdministrator(user) || user.allowedBudgetUnitIds.length > 0;
  const financeEnabled = canQueryBudgetUnits && canViewModule(user, "FINANCEIRO") && (await db.select({ id: modules.id }).from(modules).where(and(eq(modules.codigo, "FINANCEIRO"), eq(modules.ativo, true))).limit(1)).length > 0;
  const settlements = financeEnabled ? (await db.execute<{ id: string; date: string; valueDecimal: string | null; number: string }>(sql`SELECT s.id, s.date, s."valueDecimal"::text, c.number FROM "Settlement" s JOIN "Commitment" c ON c.id=s."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
     WHERE s.status='Liquidado' AND ${request.department.secretariatId ? sql`u."secretariatId"=${request.department.secretariatId}` : sql`u."secretariatId" IS NULL`} AND ${isSystemAdministrator(user) ? sql`true` : inArray(sql`a."budgetUnitId"`, user.allowedBudgetUnitIds)} AND (c."purchaseReceiptId" IS NOT NULL OR starts_with(n.code,'3.3.90.30')) ORDER BY s.date DESC, s.id ASC LIMIT 200`)).rows.map(row => ({ id: row.id, date: databaseTimestamp(row.date), valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal), commitment: { number: row.number } })) : [];

  return (
    <PageFrame className="min-h-0 max-w-6xl flex-1 space-y-4 overflow-y-auto p-4">
      <PageHeader
        title={`Requisição ${request.number}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/patrimonio/requisicoes" className="cf-portal-btn-secondary">Voltar à listagem</Link>
          </div>
        }
      />
      {recentRequests.length > 1 && (
        <nav aria-label="Alternar requisição" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs">
          <span className="font-semibold text-slate-600">Requisições recentes:</span>
          {recentRequests.map((item) => (
            <Link
              key={item.id}
              href={`/patrimonio/requisicoes/${item.id}`}
              className={item.id === request.id ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {item.number} ({item.status})
            </Link>
          ))}
        </nav>
      )}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xs sm:grid-cols-3">
        <div><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Origem</span><strong className="text-sm text-slate-800">{request.sourceWarehouse?.name || "Definida pelos lotes de entrega"}</strong></div>
        <div><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Destino</span><strong className="text-sm text-slate-800">{request.department.name}</strong></div>
        <div><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Solicitante / recebedor</span><strong className="text-sm text-slate-800">{request.requester.name}</strong></div>
        <div><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Situação</span><strong className="text-sm text-slate-800">{request.status}</strong></div>
        <div><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Aprovado por</span><strong className="text-sm text-slate-800">{request.approvedByEmployee?.name || "Aguardando análise"}</strong></div>
        <div><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Última entrega por</span><strong className="text-sm text-slate-800">{request.issuedByEmployee?.name || "Sem entrega"}</strong></div>
      </div>
      {request.justification && <p className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm shadow-xs"><span className="font-semibold text-slate-700">Justificativa:</span> {request.justification}</p>}
      {canPerformModuleOperation(user, "PATRIMONIO", "update") && !request.issuedAt && request.items.every(item => item.quantityDelivered === 0) && <form action={reviseRequestAction} className="cf-portal-form space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xs">
        <h2 className="text-sm font-bold text-slate-900">Alteração e cancelamento</h2>
        <input type="hidden" name="requestId" value={request.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">Operação<select name="operation" className="mt-1 block w-full rounded-lg border border-slate-300 p-2">{request.status === "Pendente" && <option value="edit">Alterar justificativa e quantidades</option>}{["Pendente", "Aprovada", "Recusada"].includes(request.status) && <option value="cancel">Cancelar requisição</option>}{request.status === "Cancelada" && <option value="restore">Estornar cancelamento</option>}</select></label>
          <label className="block">Motivo da operação<input name="reason" minLength={3} maxLength={2000} required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" placeholder="Descreva o motivo administrativo" /></label>
        </div>
        {request.status === "Pendente" && <div className="grid gap-3 md:grid-cols-2"><label className="block md:col-span-2">Justificativa<textarea className="mt-1 block w-full rounded-lg border border-slate-300 p-2" name="justification" defaultValue={request.justification || ""} /></label>{request.items.map(item => <label key={item.id} className="block">{item.material.name} — quantidade<input className="mt-1 block w-full rounded-lg border border-slate-300 p-2" type="number" min="0.000001" step="any" name={`quantity_${item.id}`} required defaultValue={item.quantityRequested} /></label>)}</div>}
        <div><button className="cf-portal-btn">Confirmar operação</button></div>
      </form>}
      <MaterialRequestWorkflowClient
        key={request.id}
        canApprove={canPerformModuleOperation(user, "PATRIMONIO", "update") && Boolean(user.employeeId) && user.employeeId !== request.requesterId}
        canIssue={canPerformModuleOperation(user, "PATRIMONIO", "create") && Boolean(user.employeeId)}
        operationMessage={!user.employeeId ? "Vincule seu usuário a um servidor em Configurações para aprovar ou registrar entregas." : request.status === "Pendente" && user.employeeId === request.requesterId ? "A aprovação deve ser feita por outro servidor autorizado. Você é o solicitante deste pedido." : undefined}
        request={{
          id: request.id,
          number: request.number,
          status: request.status,
          items: request.items.map((item) => ({
            id: item.id,
            quantityRequested: item.quantityRequested,
            quantityApproved: item.quantityApproved,
            quantityDelivered: item.quantityDelivered,
            material: item.material,
          })),
        }}
        stocks={stocks.map(stock => ({ ...stock, expirationLabel: stock.expirationDate?.toLocaleDateString("pt-BR", { timeZone: "UTC" }) || "—" }))}
        settlements={settlements.map(settlement => ({ id: settlement.id, label: `Empenho ${settlement.commitment.number} · ${settlement.date.toISOString().slice(0, 10)} · R$ ${settlement.valueDecimal?.toFixed(2) ?? "não conciliado"}` }))}
      />
      <RecordHistoryPanel title="Histórico de entregas e baixa do estoque" preferenceId="patrimonio-requisicao-entregas" emptyMessage="Nenhuma entrega registrada. O estoque será alterado após a aprovação e o atendimento." columns={operationalColumns([
        ["date", "Data", 150, 100], ["code", "Código", 100, 65, "identifier"], ["material", "Material", 220, 100], ["warehouse", "Origem", 170, 80], ["batch", "Lote", 100, 65], ["department", "Destino", 170, 80], ["requester", "Recebedor", 170, 80], ["quantity", "Quantidade", 100, 75, "text", "right"], ["unit", "Unidade", 75, 55],
      ])} rows={request.items.flatMap(item => item.movements.map(movement => ({ id: movement.id, label: item.material.name, values: {
        date: movement.date.toLocaleString("pt-BR"), code: item.material.code, material: item.material.name, warehouse: movement.warehouse.name,
        batch: movement.stock?.batchNumber || "Sem lote", department: request.department.name, requester: request.requester.name, quantity: String(movement.quantity), unit: item.material.unitOfMeasure,
      } })))} />
    </PageFrame>
  );
}
