import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import BenefitWorkflowClient from "./BenefitWorkflowClient";
import { db } from "@/db/client";
import { listSocialBenefitRequests, listSocialBenefits, listSocialBenefitStocks, listSocialBenefitQuotas, socialAttendanceOptions, socialReferralOptions } from "@/db/repositories/social/queries";

export default async function BenefitWorkflowPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const database = context.database ?? db;
  const [requests, benefits, units, families, employees, stock, quotas] = await Promise.all([
    listSocialBenefitRequests(database, access),
    listSocialBenefits(database).then(rows => rows.filter(row => row.isActive).map(({ id, name, dispensingMode, requiresApproval, quotaControlled, maxPerRequest, authorizerEmployeeId }) => ({ id, name, dispensingMode, requiresApproval, quotaControlled, maxPerRequest, authorizerEmployeeId }))),
    socialAttendanceOptions(database, access).then(rows => rows.units),
    socialReferralOptions(database, access).then(rows => rows.families),
    access.administrator ? socialAttendanceOptions(database, access).then(rows => rows.professionals) : [],
    listSocialBenefitStocks(database, access), listSocialBenefitQuotas(database, access),
  ]);
  const rows = requests.flatMap((request) => request.items.filter((item) => access.administrator || !item.approvalRequired || item.authorizerEmployeeId === access.employeeId || request.createdBy === context.user.id).map((item) => ({
    id: item.id, requestId: request.id, family: request.family.representative.fullName, unit: request.unit.name, date: request.createdAt.toISOString(), benefit: item.benefit.name, quantity: item.quantity, value: item.value?.toString() || "", status: item.status, awaitingStock: item.status === "APPROVED" && item.dispensingMode === "QUANTITY" && (stock.find((entry) => entry.benefitId === item.benefitId && entry.unitId === request.unitId)?.quantity || 0) < item.quantity, assessment: item.assessment || "", reason: request.reason, deliveryReason: item.deliveryReason || "", deliveredAt: item.deliveredAt?.toISOString() || "", canAssess: item.status === "PENDING" && (access.administrator || item.authorizerEmployeeId === access.employeeId), canCancel: !request.cancelledAt && !request.items.some((entry) => entry.status === "DELIVERED"),
  })));
  return <BenefitWorkflowClient rows={rows} benefits={benefits} units={units} families={families.map((family) => ({ id: family.id, name: family.representative.fullName }))} employees={employees} administrator={access.administrator} stock={stock.map((item) => ({ id: item.id, benefit: item.benefit.name, unit: item.unit.name, quantity: item.quantity }))} quotas={quotas.map((item) => ({ id: item.id, benefit: item.benefit.name, unit: item.unit.name, startsAt: item.startsAt.toISOString().slice(0, 10), endsAt: item.endsAt.toISOString().slice(0, 10), total: item.total, consumed: item.consumed }))} />;
}
