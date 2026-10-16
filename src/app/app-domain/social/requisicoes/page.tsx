import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import BenefitWorkflowClient from "./BenefitWorkflowClient";

export default async function BenefitWorkflowPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const unitScope = access.administrator ? {} : { unitId: { in: access.links.map((link) => link.unitId) } };
  const [requests, benefits, units, families, employees, stock, quotas] = await Promise.all([
    context.prisma.socialBenefitRequest.findMany({ where: unitScope, include: { family: { select: { representative: { select: { fullName: true } } } }, unit: { select: { name: true } }, items: { include: { benefit: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } }),
    context.prisma.socialBenefit.findMany({ where: { isActive: true }, select: { id: true, name: true, dispensingMode: true, requiresApproval: true, quotaControlled: true, maxPerRequest: true, authorizerEmployeeId: true }, orderBy: { name: "asc" } }),
    context.prisma.socialUnit.findMany({ where: { isActive: true, ...(access.administrator ? {} : { id: { in: access.links.map((link) => link.unitId) } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.socialFamily.findMany({ where: { status: "Ativo", ...(!access.administrator && !access.links.length ? { id: { in: [] } } : {}) }, select: { id: true, representative: { select: { fullName: true } } }, orderBy: { representative: { fullName: "asc" } } }),
    access.administrator ? context.prisma.employee.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    context.prisma.socialBenefitStock.findMany({ where: unitScope, include: { benefit: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: { benefit: { name: "asc" } } }),
    context.prisma.socialBenefitQuota.findMany({ where: unitScope, include: { benefit: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: { startsAt: "desc" } }),
  ]);
  const rows = requests.flatMap((request) => request.items.filter((item) => access.administrator || !item.approvalRequired || item.authorizerEmployeeId === access.employeeId || request.createdBy === context.user.id).map((item) => ({
    id: item.id, requestId: request.id, family: request.family.representative.fullName, unit: request.unit.name, date: request.createdAt.toISOString(), benefit: item.benefit.name, quantity: item.quantity, value: item.value?.toString() || "", status: item.status, awaitingStock: item.status === "APPROVED" && item.dispensingMode === "QUANTITY" && (stock.find((entry) => entry.benefitId === item.benefitId && entry.unitId === request.unitId)?.quantity || 0) < item.quantity, assessment: item.assessment || "", reason: request.reason, deliveryReason: item.deliveryReason || "", deliveredAt: item.deliveredAt?.toISOString() || "", canAssess: item.status === "PENDING" && (access.administrator || item.authorizerEmployeeId === access.employeeId), canCancel: !request.cancelledAt && !request.items.some((entry) => entry.status === "DELIVERED"),
  })));
  return <BenefitWorkflowClient rows={rows} benefits={benefits} units={units} families={families.map((family) => ({ id: family.id, name: family.representative.fullName }))} employees={employees} administrator={access.administrator} stock={stock.map((item) => ({ id: item.id, benefit: item.benefit.name, unit: item.unit.name, quantity: item.quantity }))} quotas={quotas.map((item) => ({ id: item.id, benefit: item.benefit.name, unit: item.unit.name, startsAt: item.startsAt.toISOString().slice(0, 10), endsAt: item.endsAt.toISOString().slice(0, 10), total: item.total, consumed: item.consumed }))} />;
}
