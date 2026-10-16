import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canPerformModuleOperation, canViewModule, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { MaterialRequestWorkflowClient } from "./MaterialRequestWorkflowClient";

export default async function RequisicaoMaterialDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const { prisma, user } = await getTenantContextForModule("PATRIMONIO");
  const request = await prisma.materialRequest.findUnique({
    where: { id },
    include: {
      department: { select: { name: true, secretariatId: true } },
      requester: { select: { name: true } },
      sourceWarehouse: { select: { name: true } },
      approvedByEmployee: { select: { name: true } },
      issuedByEmployee: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { material: { select: { id: true, code: true, name: true, unitOfMeasure: true } }, movements: { orderBy: { date: "desc" }, include: { warehouse: { select: { name: true } }, stock: { select: { batchNumber: true } } } } },
      },
    },
  });
  if (!request) notFound();

  const stocks = await prisma.materialStock.findMany({
    where: {
      materialId: { in: request.items.map((item) => item.materialId) },
      quantity: { gt: 0 },
      warehouse: { isActive: true },
      ...(request.sourceWarehouseId ? { warehouseId: request.sourceWarehouseId } : {}),
      blockedAt: null,
      OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }],
    },
    select: {
      id: true,
      materialId: true,
      quantity: true,
      batchNumber: true,
      expirationDate: true,
      warehouse: { select: { name: true } },
    },
    orderBy: [{ expirationDate: { sort: "asc", nulls: "last" } }, { batchNumber: "asc" }],
  });
  const financeEnabled = canViewModule(user, "FINANCEIRO") && Boolean(await prisma.configuracaoModulo.count({ where: { codigo: "FINANCEIRO", ativo: true } }));
  const settlements = financeEnabled ? await prisma.settlement.findMany({ where: { status: "Liquidado", commitment: { appropriation: { budgetUnit: { secretariatId: request.department.secretariatId }, ...(isSystemAdministrator(user) ? {} : { budgetUnitId: { in: user.allowedBudgetUnitIds } }) }, OR: [{ purchaseReceiptId: { not: null } }, { appropriation: { expenseNature: { code: { startsWith: "3.3.90.30" } } } }] } }, include: { commitment: { select: { number: true } } }, orderBy: [{ date: "desc" }, { id: "asc" }], take: 200 }) : [];

  return (
    <PageFrame className="min-h-0 max-w-6xl flex-1 space-y-3 overflow-y-auto p-3">
      <PageHeader title={`Requisição ${request.number}`} action={<Link href="/patrimonio/requisicoes" className="text-xs font-semibold text-slate-600 underline">Voltar à listagem</Link>} />
      <div className="grid gap-2 rounded border bg-white p-3 text-xs sm:grid-cols-2"><p><strong>Origem:</strong> {request.sourceWarehouse?.name || "Registro anterior: origem definida pelos lotes de entrega"}</p><p><strong>Destino:</strong> {request.department.name}</p><p><strong>Solicitante / recebedor:</strong> {request.requester.name}</p><p><strong>Situação:</strong> {request.status}</p><p><strong>Aprovado por:</strong> {request.approvedByEmployee?.name || "Aguardando análise"}</p><p><strong>Última entrega por:</strong> {request.issuedByEmployee?.name || "Sem entrega"}</p></div>
      {request.justification && <p className="rounded-md border bg-white p-3 text-sm"><span className="font-medium">Justificativa:</span> {request.justification}</p>}
      <MaterialRequestWorkflowClient
        key={request.updatedAt.toISOString()}
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
      <section className="rounded border bg-white p-3"><h2 className="mb-2 text-sm font-semibold">Histórico de entregas e baixa do estoque</h2>{request.items.some(item => item.movements.length) ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-100"><tr><th className="p-2">Data</th><th className="p-2">Material</th><th className="p-2">Origem / lote</th><th className="p-2">Destino</th><th className="p-2">Quantidade</th></tr></thead><tbody>{request.items.flatMap(item => item.movements.map(movement => <tr key={movement.id} className="border-t"><td className="p-2">{movement.date.toLocaleString("pt-BR")}</td><td className="p-2">{item.material.code} · {item.material.name}</td><td className="p-2">{movement.warehouse.name} · {movement.stock?.batchNumber || "Sem lote"}</td><td className="p-2">{request.department.name} · {request.requester.name}</td><td className="p-2">{movement.quantity} {item.material.unitOfMeasure}</td></tr>))}</tbody></table></div> : <p className="text-xs text-slate-500">Nenhuma entrega registrada. O estoque será alterado após a aprovação e o atendimento.</p>}</section>
    </PageFrame>
  );
}
