"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { socialDateSchema } from "@/lib/social/history-input";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { requireValidCnpj, requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "Não foi possível salvar o registro.";
}

export async function saveSocialNetworkOrganization(input: unknown) {
  try {
    const text = z.string().trim().max(250);
    const data = z.object({ id: z.string().min(1).optional(), name: text.min(2), taxId: text, organizationType: text.min(2), address: text, phone: text, email: z.union([z.literal(""), z.email()]), usesCounterReference: z.boolean(), isActive: z.boolean() }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", data.id ? "update" : "create");
    const access = await resolveSocialAccess(context);
    if (!access.administrator && !access.links.length) throw new Error("É necessário vínculo vigente para gerenciar a rede.");
    await context.prisma.$transaction(async (tx) => {
      const digits = data.taxId.replace(/\D/g, "");
      const taxId = data.taxId ? digits.length === 11 ? requireValidCpf(digits) : requireValidCnpj(digits) : null;
      const values = { ...data, taxId, address: data.address || null, phone: data.phone || null, email: data.email || null };
      const organization = data.id ? await tx.socialNetworkOrganization.update({ where: { id: data.id }, data: values }) : await tx.socialNetworkOrganization.create({ data: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialNetworkOrganization", targetId: organization.id });
    });
    revalidatePath("/social/encaminhamentos"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function registerSocialReferral(input: unknown) {
  try {
    const data = z.object({ unitId: z.string().min(1), personId: z.string(), familyId: z.string(), destinationOrganizationId: z.string().min(1), reasonId: z.string().min(1), priorityTypeId: z.string(), referredAt: socialDateSchema, referenceProfessional: z.string().trim().max(250), objective: z.string().trim().min(3).max(4000), observations: z.string().trim().max(4000) }).refine((value) => Boolean(value.personId) !== Boolean(value.familyId), "Selecione uma pessoa ou uma família.").parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    assertSocialUnitAccess(await resolveSocialAccess(context), data.unitId);
    await context.prisma.$transaction(async (tx) => {
      const [unit, destination, reason] = await Promise.all([
        tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true } }),
        tx.socialNetworkOrganization.findFirst({ where: { id: data.destinationOrganizationId, isActive: true } }),
        tx.socialCatalogEntry.findFirst({ where: { id: data.reasonId, kind: "REFERRAL_REASON", isActive: true } }),
      ]);
      if (!unit || !destination || !reason) throw new Error("Equipamento, destino ou motivo inativo/inexistente.");
      if (data.personId && !await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Pessoa inativa/inexistente.");
      if (data.familyId && !await tx.socialFamily.findFirst({ where: { id: data.familyId, status: "Ativo" }, select: { id: true } })) throw new Error("Família inativa/inexistente.");
      if (data.priorityTypeId && !await tx.socialCatalogEntry.findFirst({ where: { id: data.priorityTypeId, kind: "PRIORITY", isActive: true } })) throw new Error("Público prioritário inválido.");
      const referral = await tx.socialReferral.create({ data: { ...data, personId: data.personId || null, familyId: data.familyId || null, priorityTypeId: data.priorityTypeId || null, referredAt: new Date(`${data.referredAt}T00:00:00Z`), createdBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialReferral", targetId: referral.id });
    });
    revalidatePath("/social/encaminhamentos"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function returnSocialReferral(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), attendedAt: socialDateSchema, professional: z.string().trim().min(2).max(250), description: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await context.prisma.$transaction(async (tx) => {
      const current = await tx.socialReferral.findUnique({ where: { id: data.id }, include: { destinationOrganization: { select: { usesCounterReference: true } } } });
      if (!current) throw new Error("Encaminhamento inexistente.");
      assertSocialUnitAccess(access, current.unitId);
      if (!current.destinationOrganization.usesCounterReference) throw new Error("O órgão de destino não utiliza contrarreferência.");
      if (data.attendedAt < current.referredAt.toISOString().slice(0, 10)) throw new Error("Atendimento anterior ao encaminhamento.");
      const result = await tx.socialReferral.updateMany({ where: { id: data.id, status: "OPEN" }, data: { status: "RETURNED", counterReferenceAt: new Date(`${data.attendedAt}T00:00:00Z`), counterReferenceProfessional: data.professional, counterReferenceDescription: data.description, counterReferenceBy: context.user.id } });
      if (result.count !== 1) throw new Error("Contrarreferência já registrada.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialReferral", targetId: data.id });
    });
    revalidatePath("/social/encaminhamentos"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
