"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { getPostgresError } from "@/db/errors";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { users } from "@/db/schema/identity";
import { socialBenefits, socialBenefitQuotas, socialBenefitRequests, socialBenefitRequestItems, socialBenefitStocks, socialBenefitStockMovements, socialFamilies, socialProfessionalLinks, socialUnits } from "@/db/schema/social";
import { getTenantContextForModuleOperation, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { socialDateSchema } from "@/lib/social/history-input";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertInternalNotifications } from "@/db/repositories/platform/notifications";
import { deliverBenefitInTransaction } from "@/lib/social/benefit-delivery";

const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).refine((value) => Number(value) > 0);
const quantity = z.number().int().positive().max(1000000);
function refresh() { revalidatePath("/social/requisicoes"); revalidatePath("/social/beneficios"); }
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && !getPostgresError(error)) return error.message;
  return "Não foi possível concluir a operação. Atualize a página e tente novamente.";
}
async function lockBenefit(tx: DatabaseTransaction, id: string) {
  await tx.execute(sql`SELECT "id" FROM "SocialBenefit" WHERE "id" = ${id} FOR UPDATE`);
}
async function lockRequest(tx: DatabaseTransaction, id: string) {
  await tx.execute(sql`SELECT "id" FROM "SocialBenefitRequest" WHERE "id" = ${id} FOR UPDATE`);
}

export async function configureSocialBenefit(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), dispensingMode: z.enum(["QUANTITY", "VALUE"]), requiresApproval: z.boolean(), quotaControlled: z.boolean(), maxPerRequest: quantity, authorizerEmployeeId: z.string() }).parse(input);
    const context = await getTenantContextForSystemAdministration();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (data.requiresApproval && !data.authorizerEmployeeId) throw new Error("Defina o profissional autorizador.");
      if (data.authorizerEmployeeId && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, data.authorizerEmployeeId), eq(employees.isActive, true))).limit(1)).length) throw new Error("Autorizador inativo ou inexistente.");
      const updated = await tx.update(socialBenefits).set({ dispensingMode: data.dispensingMode, requiresApproval: data.requiresApproval, quotaControlled: data.quotaControlled, maxPerRequest: data.maxPerRequest, authorizerEmployeeId: data.authorizerEmployeeId || null }).where(eq(socialBenefits.id, data.id)).returning({ id: socialBenefits.id });
      if (!updated.length) throw new Error("Benefício inexistente.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefit", targetId: data.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function registerSocialBenefitReceipt(input: unknown) {
  try {
    const data = z.object({ benefitId: z.string().min(1), unitId: z.string().min(1), quantity, supplierName: z.string().trim().min(2).max(160), invoiceNumber: z.string().trim().min(1).max(80), invoiceDate: socialDateSchema, invoiceValue: money }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    assertSocialUnitAccess(await resolveSocialAccess(context), data.unitId);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockBenefit(tx, data.benefitId);
      const [benefit] = await tx.select({ id: socialBenefits.id }).from(socialBenefits).where(and(eq(socialBenefits.id, data.benefitId), eq(socialBenefits.isActive, true), eq(socialBenefits.dispensingMode, "QUANTITY")));
      const [unit] = await tx.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true)));
      if (!benefit || !unit) throw new Error("Selecione benefício por quantidade e equipamento ativos.");
      const [movement] = await tx.insert(socialBenefitStockMovements).values({ ...data, invoiceValue: new Decimal(data.invoiceValue), invoiceDate: new Date(`${data.invoiceDate}T00:00:00Z`), direction: "IN", createdBy: context.user.id }).returning({ id: socialBenefitStockMovements.id });
      await tx.insert(socialBenefitStocks).values({ benefitId: data.benefitId, unitId: data.unitId, quantity: data.quantity }).onConflictDoUpdate({ target: [socialBenefitStocks.benefitId, socialBenefitStocks.unitId], set: { quantity: sql`${socialBenefitStocks.quantity} + ${data.quantity}` } });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitStockMovement", targetId: movement.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function registerSocialBenefitQuota(input: unknown) {
  try {
    const data = z.object({ benefitId: z.string().min(1), unitId: z.string().min(1), startsAt: socialDateSchema, endsAt: socialDateSchema, total: quantity }).refine((value) => value.endsAt >= value.startsAt, "Período inválido.").parse(input);
    const context = await getTenantContextForSystemAdministration();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockBenefit(tx, data.benefitId);
      const startsAt = new Date(`${data.startsAt}T00:00:00Z`);
      const endsAt = new Date(`${data.endsAt}T00:00:00Z`);
      if ((await tx.select({ id: socialBenefitQuotas.id }).from(socialBenefitQuotas).where(and(eq(socialBenefitQuotas.benefitId, data.benefitId), eq(socialBenefitQuotas.unitId, data.unitId), lte(socialBenefitQuotas.startsAt, endsAt), gte(socialBenefitQuotas.endsAt, startsAt))).limit(1)).length) throw new Error("Já existe cota sobreposta para este benefício/equipamento.");
      if (!(await tx.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true)))).length) throw new Error("Equipamento inativo.");
      const [quota] = await tx.insert(socialBenefitQuotas).values({ ...data, startsAt, endsAt }).returning({ id: socialBenefitQuotas.id });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitQuota", targetId: quota.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function registerSocialBenefitRequest(input: unknown) {
  try {
    const data = z.object({ familyId: z.string().min(1), unitId: z.string().min(1), reason: z.string().trim().min(3).max(4000), items: z.array(z.object({ benefitId: z.string().min(1), quantity, value: z.union([z.literal(""), money]) })).min(1).max(30) }).parse(input);
    if (new Set(data.items.map((item) => item.benefitId)).size !== data.items.length) throw new Error("Informe cada benefício uma única vez na requisição.");
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    assertSocialUnitAccess(await resolveSocialAccess(context), data.unitId);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [family] = await tx.select({ id: socialFamilies.id }).from(socialFamilies).where(and(eq(socialFamilies.id, data.familyId), eq(socialFamilies.status, "Ativo")));
      const [unit] = await tx.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true)));
      if (!family || !unit) throw new Error("Família ou equipamento inativo/inexistente.");
      const items: { benefitId: string; quantity: number; value: Decimal | null; approvalRequired: boolean; dispensingMode: string; quotaControlled: boolean; authorizerEmployeeId: string | null; status: string }[] = [];
      for (const item of data.items) {
        const [benefit] = await tx.select().from(socialBenefits).where(and(eq(socialBenefits.id, item.benefitId), eq(socialBenefits.isActive, true)));
        if (!benefit) throw new Error("Benefício inativo ou inexistente.");
        if (item.quantity > benefit.maxPerRequest) throw new Error(`${benefit.name}: quantidade superior ao limite por requisição (${benefit.maxPerRequest}).`);
        if (benefit.dispensingMode === "VALUE" && !item.value) throw new Error(`${benefit.name}: informe o valor solicitado.`);
        if (benefit.requiresApproval) {
          if (!benefit.authorizerEmployeeId) throw new Error(`${benefit.name}: autorizador não configurado.`);
          const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
          const links = await tx.select({ id: socialProfessionalLinks.id }).from(socialProfessionalLinks).innerJoin(employees, eq(employees.id, socialProfessionalLinks.employeeId)).where(and(eq(socialProfessionalLinks.employeeId, benefit.authorizerEmployeeId), eq(employees.isActive, true), eq(socialProfessionalLinks.unitId, data.unitId), eq(socialProfessionalLinks.isActive, true), lte(socialProfessionalLinks.startsAt, today), or(isNull(socialProfessionalLinks.endsAt), gte(socialProfessionalLinks.endsAt, today)))).limit(1);
          if (!links.length) throw new Error(`${benefit.name}: autorizador sem vínculo vigente no equipamento requisitante.`);
        }
        items.push({ benefitId: benefit.id, quantity: item.quantity, value: benefit.dispensingMode === "VALUE" ? new Decimal(item.value) : null, approvalRequired: benefit.requiresApproval, dispensingMode: benefit.dispensingMode, quotaControlled: benefit.quotaControlled, authorizerEmployeeId: benefit.authorizerEmployeeId, status: benefit.requiresApproval ? "PENDING" : "APPROVED" });
      }
      const [request] = await tx.insert(socialBenefitRequests).values({ familyId: data.familyId, unitId: data.unitId, reason: data.reason, createdBy: context.user.id }).returning({ id: socialBenefitRequests.id });
      await tx.insert(socialBenefitRequestItems).values(items.map(item => ({ ...item, requestId: request.id })));
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequest", targetId: request.id });
      const employeeIds = [...new Set(items.filter((item) => item.approvalRequired).map((item) => item.authorizerEmployeeId).filter((id): id is string => typeof id === "string"))];
      if (employeeIds.length) {
        const recipients = await tx.select({ id: users.id }).from(users).where(and(eq(users.ativo, true), inArray(users.employeeId, employeeIds)));
        await insertInternalNotifications(tx, { actorUsuarioId: context.user.id, recipientUserIds: recipients.map((recipient) => recipient.id), sourceModule: "SOCIAL", entityType: "SOCIAL_BENEFIT_REQUEST", entityId: request.id, type: "BENEFIT_APPROVAL_REQUIRED", title: "Benefício aguardando avaliação", message: "Há uma requisição pendente de avaliação em Requisições e Dispensação da Assistência Social.", dedupeDiscriminator: "REQUEST_CREATED" });
      }
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function assessSocialBenefitItem(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), approve: z.boolean(), assessment: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [current] = await tx.select({ item: socialBenefitRequestItems, request: socialBenefitRequests }).from(socialBenefitRequestItems).innerJoin(socialBenefitRequests, eq(socialBenefitRequests.id, socialBenefitRequestItems.requestId)).where(eq(socialBenefitRequestItems.id, data.id));
      if (!current) throw new Error("Item não encontrado.");
      await lockRequest(tx, current.item.requestId);
      const [request] = await tx.select().from(socialBenefitRequests).where(eq(socialBenefitRequests.id, current.item.requestId));
      if (request?.cancelledAt) throw new Error("Requisição cancelada.");
      assertSocialUnitAccess(access, current.request.unitId);
      if (!access.administrator && current.item.authorizerEmployeeId !== access.employeeId) throw new Error("Você não é o autorizador deste benefício.");
      const result = await tx.update(socialBenefitRequestItems).set({ status: data.approve ? "APPROVED" : "DENIED", evaluatedAt: new Date(), evaluatedBy: context.user.id, assessment: data.assessment }).where(and(eq(socialBenefitRequestItems.id, data.id), eq(socialBenefitRequestItems.status, "PENDING"))).returning({ id: socialBenefitRequestItems.id });
      if (result.length !== 1) throw new Error("Item já avaliado. Atualize a página.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequestItem", targetId: data.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function deliverSocialBenefitItem(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      const itemId = await deliverBenefitInTransaction(tx, access, { itemId: data.id, actorId: context.user.id, reason: data.reason, today });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequestItem", targetId: itemId });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function cancelSocialBenefitRequest(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockRequest(tx, data.id);
      const [request] = await tx.select().from(socialBenefitRequests).where(eq(socialBenefitRequests.id, data.id));
      if (!request || request.cancelledAt) throw new Error("Requisição inexistente ou já cancelada.");
      assertSocialUnitAccess(access, request.unitId);
      const delivered = await tx.select({ id: socialBenefitRequestItems.id }).from(socialBenefitRequestItems).where(and(eq(socialBenefitRequestItems.requestId, request.id), eq(socialBenefitRequestItems.status, "DELIVERED"))).limit(1);
      if (delivered.length) throw new Error("Requisição com entrega registrada não pode ser cancelada.");
      await tx.update(socialBenefitRequests).set({ cancelledAt: new Date(), cancellationReason: data.reason }).where(eq(socialBenefitRequests.id, request.id));
      await tx.update(socialBenefitRequestItems).set({ status: "CANCELLED" }).where(eq(socialBenefitRequestItems.requestId, request.id));
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequest", targetId: request.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
