"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getTenantContextForModuleOperation, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { socialDateSchema } from "@/lib/social/history-input";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { createInternalNotifications } from "@/lib/notifications/internal-notifications";
import { deliverBenefitInTransaction } from "@/lib/social/benefit-delivery";

const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).refine((value) => Number(value) > 0);
const quantity = z.number().int().positive().max(1000000);
function refresh() { revalidatePath("/social/requisicoes"); revalidatePath("/social/beneficios"); }
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "Não foi possível concluir a operação. Atualize a página e tente novamente.";
}
async function lockBenefit(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "SocialBenefit" WHERE "id" = ${id} FOR UPDATE`;
}
async function lockRequest(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "SocialBenefitRequest" WHERE "id" = ${id} FOR UPDATE`;
}

export async function configureSocialBenefit(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), dispensingMode: z.enum(["QUANTITY", "VALUE"]), requiresApproval: z.boolean(), quotaControlled: z.boolean(), maxPerRequest: quantity, authorizerEmployeeId: z.string() }).parse(input);
    const context = await getTenantContextForSystemAdministration();
    await context.prisma.$transaction(async (tx) => {
      if (data.requiresApproval && !data.authorizerEmployeeId) throw new Error("Defina o profissional autorizador.");
      if (data.authorizerEmployeeId && !await tx.employee.findFirst({ where: { id: data.authorizerEmployeeId, isActive: true } })) throw new Error("Autorizador inativo ou inexistente.");
      await tx.socialBenefit.update({ where: { id: data.id }, data: { ...data, authorizerEmployeeId: data.authorizerEmployeeId || null } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefit", targetId: data.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function registerSocialBenefitReceipt(input: unknown) {
  try {
    const data = z.object({ benefitId: z.string().min(1), unitId: z.string().min(1), quantity, supplierName: z.string().trim().min(2).max(160), invoiceNumber: z.string().trim().min(1).max(80), invoiceDate: socialDateSchema, invoiceValue: money }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    assertSocialUnitAccess(await resolveSocialAccess(context), data.unitId);
    await context.prisma.$transaction(async (tx) => {
      await lockBenefit(tx, data.benefitId);
      const benefit = await tx.socialBenefit.findFirst({ where: { id: data.benefitId, isActive: true, dispensingMode: "QUANTITY" } });
      const unit = await tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true } });
      if (!benefit || !unit) throw new Error("Selecione benefício por quantidade e equipamento ativos.");
      const movement = await tx.socialBenefitStockMovement.create({ data: { ...data, invoiceDate: new Date(`${data.invoiceDate}T00:00:00Z`), direction: "IN", createdBy: context.user.id } });
      await tx.socialBenefitStock.upsert({ where: { benefitId_unitId: { benefitId: data.benefitId, unitId: data.unitId } }, create: { benefitId: data.benefitId, unitId: data.unitId, quantity: data.quantity }, update: { quantity: { increment: data.quantity } } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitStockMovement", targetId: movement.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function registerSocialBenefitQuota(input: unknown) {
  try {
    const data = z.object({ benefitId: z.string().min(1), unitId: z.string().min(1), startsAt: socialDateSchema, endsAt: socialDateSchema, total: quantity }).refine((value) => value.endsAt >= value.startsAt, "Período inválido.").parse(input);
    const context = await getTenantContextForSystemAdministration();
    await context.prisma.$transaction(async (tx) => {
      await lockBenefit(tx, data.benefitId);
      const startsAt = new Date(`${data.startsAt}T00:00:00Z`);
      const endsAt = new Date(`${data.endsAt}T00:00:00Z`);
      if (await tx.socialBenefitQuota.findFirst({ where: { benefitId: data.benefitId, unitId: data.unitId, startsAt: { lte: endsAt }, endsAt: { gte: startsAt } } })) throw new Error("Já existe cota sobreposta para este benefício/equipamento.");
      if (!await tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true } })) throw new Error("Equipamento inativo.");
      const quota = await tx.socialBenefitQuota.create({ data: { ...data, startsAt, endsAt } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitQuota", targetId: quota.id });
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
    await context.prisma.$transaction(async (tx) => {
      const family = await tx.socialFamily.findFirst({ where: { id: data.familyId, status: "Ativo" } });
      const unit = await tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true } });
      if (!family || !unit) throw new Error("Família ou equipamento inativo/inexistente.");
      const items: Prisma.SocialBenefitRequestItemCreateWithoutRequestInput[] = [];
      for (const item of data.items) {
        const benefit = await tx.socialBenefit.findFirst({ where: { id: item.benefitId, isActive: true } });
        if (!benefit) throw new Error("Benefício inativo ou inexistente.");
        if (item.quantity > benefit.maxPerRequest) throw new Error(`${benefit.name}: quantidade superior ao limite por requisição (${benefit.maxPerRequest}).`);
        if (benefit.dispensingMode === "VALUE" && !item.value) throw new Error(`${benefit.name}: informe o valor solicitado.`);
        if (benefit.requiresApproval) {
          if (!benefit.authorizerEmployeeId) throw new Error(`${benefit.name}: autorizador não configurado.`);
          const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
          if (!await tx.socialProfessionalLink.findFirst({ where: { employeeId: benefit.authorizerEmployeeId, employee: { isActive: true }, unitId: data.unitId, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] } })) throw new Error(`${benefit.name}: autorizador sem vínculo vigente no equipamento requisitante.`);
        }
        items.push({ benefit: { connect: { id: benefit.id } }, quantity: item.quantity, value: benefit.dispensingMode === "VALUE" ? item.value : null, approvalRequired: benefit.requiresApproval, dispensingMode: benefit.dispensingMode, quotaControlled: benefit.quotaControlled, authorizerEmployeeId: benefit.authorizerEmployeeId, status: benefit.requiresApproval ? "PENDING" : "APPROVED" });
      }
      const request = await tx.socialBenefitRequest.create({ data: { familyId: data.familyId, unitId: data.unitId, reason: data.reason, createdBy: context.user.id, items: { create: items } } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequest", targetId: request.id });
      const employeeIds = [...new Set(items.filter((item) => item.approvalRequired).map((item) => item.authorizerEmployeeId).filter((id): id is string => typeof id === "string"))];
      if (employeeIds.length) {
        const recipients = await tx.usuario.findMany({ where: { ativo: true, employeeId: { in: employeeIds } }, select: { id: true } });
        await createInternalNotifications(tx, { actorUsuarioId: context.user.id, recipientUserIds: recipients.map((recipient) => recipient.id), sourceModule: "SOCIAL", entityType: "SOCIAL_BENEFIT_REQUEST", entityId: request.id, type: "BENEFIT_APPROVAL_REQUIRED", title: "Benefício aguardando avaliação", message: "Há uma requisição pendente de avaliação em Requisições e Dispensação da Assistência Social.", dedupeDiscriminator: "REQUEST_CREATED" });
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
    await context.prisma.$transaction(async (tx) => {
      const current = await tx.socialBenefitRequestItem.findUnique({ where: { id: data.id }, include: { request: true } });
      if (!current) throw new Error("Item não encontrado.");
      await lockRequest(tx, current.requestId);
      const request = await tx.socialBenefitRequest.findUnique({ where: { id: current.requestId } });
      if (request?.cancelledAt) throw new Error("Requisição cancelada.");
      assertSocialUnitAccess(access, current.request.unitId);
      if (!access.administrator && current.authorizerEmployeeId !== access.employeeId) throw new Error("Você não é o autorizador deste benefício.");
      const result = await tx.socialBenefitRequestItem.updateMany({ where: { id: data.id, status: "PENDING" }, data: { status: data.approve ? "APPROVED" : "DENIED", evaluatedAt: new Date(), evaluatedBy: context.user.id, assessment: data.assessment } });
      if (result.count !== 1) throw new Error("Item já avaliado. Atualize a página.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequestItem", targetId: data.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function deliverSocialBenefitItem(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await context.prisma.$transaction(async (tx) => {
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      const itemId = await deliverBenefitInTransaction(tx, access, { itemId: data.id, actorId: context.user.id, reason: data.reason, today });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequestItem", targetId: itemId });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}

export async function cancelSocialBenefitRequest(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await context.prisma.$transaction(async (tx) => {
      await lockRequest(tx, data.id);
      const request = await tx.socialBenefitRequest.findUnique({ where: { id: data.id }, include: { items: { select: { status: true } } } });
      if (!request || request.cancelledAt) throw new Error("Requisição inexistente ou já cancelada.");
      assertSocialUnitAccess(access, request.unitId);
      if (request.items.some((item) => item.status === "DELIVERED")) throw new Error("Requisição com entrega registrada não pode ser cancelada.");
      await tx.socialBenefitRequest.update({ where: { id: request.id }, data: { cancelledAt: new Date(), cancellationReason: data.reason, items: { updateMany: { where: {}, data: { status: "CANCELLED" } } } } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialBenefitRequest", targetId: request.id });
    });
    refresh(); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
