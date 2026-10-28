import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { canManagePurchaseRequest } from "@/lib/compras/purchase-request-policy";
import { db } from "@/db/client";
import { listPurchaseRequests } from "@/db/repositories/procurement/purchase-requests";
import { SolicitacoesListClient } from "./SolicitacoesListClient";

export default async function SolicitacoesPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const { user } = context;
  const solicitacoes = await listPurchaseRequests(context.database ?? db).catch(() => []);

  return <SolicitacoesListClient requests={solicitacoes.map((request) => ({
    id: request.id,
    number: request.number,
    object: request.object,
    status: request.status,
    priority: request.priority,
    estimatedValue: request.estimatedValue,
    createdAt: request.createdAt.toISOString(),
    secretariatName: request.secretariat.acronym || request.secretariat.name,
    departmentName: request.department.name,
    requesterName: request.requester.name,
    itemCount: request._count.items,
    canManage: canManagePurchaseRequest(user, request),
  }))} />;
}
