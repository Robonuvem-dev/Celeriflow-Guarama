import Link from "next/link";
import { notFound } from "next/navigation";
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

export default async function RequisicaoMaterialDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const { user } = await getTenantContextForModule("PATRIMONIO");
  const approvers = alias(employees, "request_approvers"), issuers = alias(employees, "request_issuers");
  const [loaded] = await db.select({ request: materialRequests, department: { name: departments.name, secretariatId: departments.secretariatId }, requester: { name: employees.name }, sourceWarehouse: { name: warehouses.name }, approvedByEmployee: { name: approvers.name }, issuedByEmployee: { name: issuers.name } }).from(materialRequests)
    .innerJoin(departments, eq(departments.id, materialRequests.departmentId)).innerJoin(employees, eq(employees.id, materialRequests.requesterId)).leftJoin(warehouses, eq(warehouses.id, materialRequests.sourceWarehouseId))
    .leftJoin(approvers, eq(approvers.id, materialRequests.approvedByEmployeeId)).leftJoin(issuers, eq(issuers.id, materialRequests.issuedByEmployeeId)).where(eq(materialRequests.id, id)).limit(1);
  if (!loaded) notFound();
  const items = await db.select({ item: materialRequestItems, material: { id: materials.id, code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(materialRequestItems)
    .innerJoin(materials, eq(materials.id, materialRequestItems.materialId)).where(eq(materialRequestItems.requestId, id)).orderBy(asc(materialRequestItems.createdAt));
  const movements = items.length ? await db.select({ movement: materialMovements, warehouse: { name: warehouses.name }, stock: { id: materialStocks.id, batchNumber: materialStocks.batchNumber } }).from(materialMovements)
    .innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId)).leftJoin(materialStocks, eq(materialStocks.id, materialMovements.stockId)).where(inArray(materialMovements.materialRequestItemId, items.map(row => row.item.id))).orderBy(desc(materialMovements.date)) : [];
  const request = { ...loaded.request, department: loaded.department, requester: loaded.requester, sourceWarehouse: loaded.sourceWarehouse, approvedByEmployee: loaded.approvedByEmployee, issuedByEmployee: loaded.issuedByEmployee,
    items: items.map(row => ({ ...row.item, material: row.material, movements: movements.filter(movement => movement.movement.materialRequestItemId === row.item.id).map(movement => ({ ...movement.movement, warehouse: movement.warehouse, stock: movement.stock })) })) };
  const stocks = await db.select({ id: materialStocks.id, materialId: materialStocks.materialId, quantity: materialStocks.quantity, batchNumber: materialStocks.batchNumber, expirationDate: materialStocks.expirationDate, warehouse: { name: warehouses.name } }).from(materialStocks).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId))
    .where(and(inArray(materialStocks.materialId, request.items.map(item => item.materialId)), gt(materialStocks.quantity, 0), eq(warehouses.isActive, true), request.sourceWarehouseId ? eq(materialStocks.warehouseId, request.sourceWarehouseId) : undefined, isNull(materialStocks.blockedAt), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date()))))
    .orderBy(sql`${materialStocks.expirationDate} ASC NULLS LAST`, asc(materialStocks.batchNumber));
  const financeEnabled = canViewModule(user, "FINANCEIRO") && (await db.select({ id: modules.id }).from(modules).where(and(eq(modules.codigo, "FINANCEIRO"), eq(modules.ativo, true))).limit(1)).length > 0;
   const settlements = financeEnabled ? (await db.execute<{ id: string; date: string; valueDecimal: string | null; number: string }>(sql`SELECT s.id, s.date, s."valueDecimal"::text, c.number FROM "Settlement" s JOIN "Commitment" c ON c.id=s."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
     WHERE s.status='Liquidado' AND ${request.department.secretariatId ? sql`u."secretariatId"=${request.department.secretariatId}` : sql`u."secretariatId" IS NULL`} AND ${isSystemAdministrator(user) ? sql`true` : inArray(sql`a."budgetUnitId"`, user.allowedBudgetUnitIds)} AND (c."purchaseReceiptId" IS NOT NULL OR starts_with(n.code,'3.3.90.30')) ORDER BY s.date DESC, s.id ASC LIMIT 200`)).rows.map(row => ({ id: row.id, date: databaseTimestamp(row.date), valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal), commitment: { number: row.number } })) : [];

  return (
    <PageFrame className="min-h-0 max-w-6xl flex-1 space-y-3 overflow-y-auto p-3">
      <PageHeader title={`Requisição ${request.number}`} action={<Link href="/patrimonio/requisicoes" className="text-xs font-semibold text-slate-600 underline">Voltar à listagem</Link>} />
      <div className="grid gap-2 rounded border bg-white p-3 text-xs sm:grid-cols-2"><p><strong>Origem:</strong> {request.sourceWarehouse?.name || "Registro anterior: origem definida pelos lotes de entrega"}</p><p><strong>Destino:</strong> {request.department.name}</p><p><strong>Solicitante / recebedor:</strong> {request.requester.name}</p><p><strong>Situação:</strong> {request.status}</p><p><strong>Aprovado por:</strong> {request.approvedByEmployee?.name || "Aguardando análise"}</p><p><strong>Última entrega por:</strong> {request.issuedByEmployee?.name || "Sem entrega"}</p></div>
      {request.justification && <p className="rounded-md border bg-white p-3 text-sm"><span className="font-medium">Justificativa:</span> {request.justification}</p>}
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
