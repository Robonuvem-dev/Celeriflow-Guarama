import type { Prisma } from "@prisma/client";
import { assertSocialUnitAccess, type SocialAccess } from "./access-policy";

export async function deliverBenefitInTransaction(tx: Prisma.TransactionClient, access: SocialAccess, input: { itemId: string; actorId: string; reason: string; today: Date }) {
  const initial = await tx.socialBenefitRequestItem.findUnique({ where: { id: input.itemId } });
  if (!initial) throw new Error("Item não encontrado.");
  await tx.$queryRaw`SELECT "id" FROM "SocialBenefitRequest" WHERE "id" = ${initial.requestId} FOR UPDATE`;
  const item = await tx.socialBenefitRequestItem.findUnique({ where: { id: input.itemId }, include: { request: true } });
  if (!item || item.status !== "APPROVED" || item.request.cancelledAt) throw new Error("Somente item autorizado de requisição ativa pode ser entregue.");
  assertSocialUnitAccess(access, item.request.unitId);
  await tx.$queryRaw`SELECT "id" FROM "SocialBenefit" WHERE "id" = ${item.benefitId} FOR UPDATE`;
  const benefit = await tx.socialBenefit.findUnique({ where: { id: item.benefitId }, select: { isActive: true } });
  const unit = await tx.socialUnit.findUnique({ where: { id: item.request.unitId }, select: { isActive: true } });
  if (!benefit?.isActive || !unit?.isActive) throw new Error("Benefício ou equipamento inativo.");
  if (item.approvalRequired && !item.evaluatedAt) throw new Error("Avaliação obrigatória ainda não registrada.");
  if (item.quotaControlled) {
    const quota = await tx.socialBenefitQuota.findFirst({ where: { benefitId: item.benefitId, unitId: item.request.unitId, startsAt: { lte: input.today }, endsAt: { gte: input.today } } });
    if (!quota || quota.total - quota.consumed < item.quantity) throw new Error("Cota vigente inexistente ou insuficiente.");
    await tx.socialBenefitQuota.update({ where: { id: quota.id }, data: { consumed: { increment: item.quantity } } });
  }
  if (item.dispensingMode === "QUANTITY") {
    const stock = await tx.socialBenefitStock.updateMany({ where: { benefitId: item.benefitId, unitId: item.request.unitId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } });
    if (stock.count !== 1) throw new Error("Estoque insuficiente. O item continua autorizado e aguardando reposição.");
    await tx.socialBenefitStockMovement.create({ data: { benefitId: item.benefitId, unitId: item.request.unitId, direction: "OUT", quantity: item.quantity, requestItemId: item.id, createdBy: input.actorId } });
  }
  await tx.socialBenefitRequestItem.update({ where: { id: item.id }, data: { status: "DELIVERED", deliveredAt: new Date(), deliveredBy: input.actorId, deliveryReason: input.reason } });
  return item.id;
}
