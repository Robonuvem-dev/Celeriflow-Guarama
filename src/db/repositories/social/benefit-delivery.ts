import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../transaction";
import { socialBenefits, socialBenefitQuotas, socialBenefitRequestItems, socialBenefitRequests, socialBenefitStockMovements, socialBenefitStocks, socialUnits } from "../../schema/social";
import { assertSocialUnitAccess, type SocialAccess } from "@/lib/social/access-policy";

export async function deliverBenefitInTransaction(tx: DatabaseTransaction, access: SocialAccess, input: { itemId: string; actorId: string; reason: string; today: Date }): Promise<string> {
  const [initial] = await tx.select({ requestId: socialBenefitRequestItems.requestId }).from(socialBenefitRequestItems).where(eq(socialBenefitRequestItems.id, input.itemId));
  if (!initial) throw new Error("Item não encontrado.");
  await tx.execute(sql`SELECT "id" FROM "SocialBenefitRequest" WHERE "id" = ${initial.requestId} FOR UPDATE`);
  const [current] = await tx.select({ item: socialBenefitRequestItems, request: socialBenefitRequests }).from(socialBenefitRequestItems)
    .innerJoin(socialBenefitRequests, eq(socialBenefitRequests.id, socialBenefitRequestItems.requestId)).where(eq(socialBenefitRequestItems.id, input.itemId));
  if (!current || current.item.status !== "APPROVED" || current.request.cancelledAt) throw new Error("Somente item autorizado de requisição ativa pode ser entregue.");
  const { item, request } = current;
  assertSocialUnitAccess(access, request.unitId);
  await tx.execute(sql`SELECT "id" FROM "SocialBenefit" WHERE "id" = ${item.benefitId} FOR UPDATE`);
  const [benefit] = await tx.select({ isActive: socialBenefits.isActive }).from(socialBenefits).where(eq(socialBenefits.id, item.benefitId));
  const [unit] = await tx.select({ isActive: socialUnits.isActive }).from(socialUnits).where(eq(socialUnits.id, request.unitId));
  if (!benefit?.isActive || !unit?.isActive) throw new Error("Benefício ou equipamento inativo.");
  if (item.approvalRequired && !item.evaluatedAt) throw new Error("Avaliação obrigatória ainda não registrada.");
  if (item.quotaControlled) {
    const [quota] = await tx.select().from(socialBenefitQuotas).where(and(eq(socialBenefitQuotas.benefitId, item.benefitId), eq(socialBenefitQuotas.unitId, request.unitId), lte(socialBenefitQuotas.startsAt, input.today), gte(socialBenefitQuotas.endsAt, input.today))).limit(1);
    if (!quota || quota.total - quota.consumed < item.quantity) throw new Error("Cota vigente inexistente ou insuficiente.");
    await tx.update(socialBenefitQuotas).set({ consumed: sql`${socialBenefitQuotas.consumed} + ${item.quantity}` }).where(eq(socialBenefitQuotas.id, quota.id));
  }
  if (item.dispensingMode === "QUANTITY") {
    const stock = await tx.update(socialBenefitStocks).set({ quantity: sql`${socialBenefitStocks.quantity} - ${item.quantity}` })
      .where(and(eq(socialBenefitStocks.benefitId, item.benefitId), eq(socialBenefitStocks.unitId, request.unitId), gte(socialBenefitStocks.quantity, item.quantity))).returning({ id: socialBenefitStocks.id });
    if (stock.length !== 1) throw new Error("Estoque insuficiente. O item continua autorizado e aguardando reposição.");
    await tx.insert(socialBenefitStockMovements).values({ benefitId: item.benefitId, unitId: request.unitId, direction: "OUT", quantity: item.quantity, requestItemId: item.id, createdBy: input.actorId });
  }
  await tx.update(socialBenefitRequestItems).set({ status: "DELIVERED", deliveredAt: new Date(), deliveredBy: input.actorId, deliveryReason: input.reason }).where(eq(socialBenefitRequestItems.id, item.id));
  return item.id;
}
