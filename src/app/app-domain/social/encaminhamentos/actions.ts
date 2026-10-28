"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { socialDateSchema } from "@/lib/social/history-input";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { requireValidCnpj, requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { and, eq } from "drizzle-orm";
import { people } from "@/db/schema/people";
import { socialCatalogEntries, socialFamilies, socialNetworkOrganizations, socialReferrals, socialUnits } from "@/db/schema/social";

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && !getPostgresError(error)) return error.message;
  return "Não foi possível salvar o registro.";
}

export async function saveSocialNetworkOrganization(input: unknown) {
  try {
    const text = z.string().trim().max(250);
    const data = z.object({ id: z.string().min(1).optional(), name: text.min(2), taxId: text, organizationType: text.min(2), address: text, phone: text, email: z.union([z.literal(""), z.email()]), usesCounterReference: z.boolean(), isActive: z.boolean() }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", data.id ? "update" : "create");
    const access = await resolveSocialAccess(context);
    if (!access.administrator && !access.links.length) throw new Error("É necessário vínculo vigente para gerenciar a rede.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const digits = data.taxId.replace(/\D/g, "");
      const taxId = data.taxId ? digits.length === 11 ? requireValidCpf(digits) : requireValidCnpj(digits) : null;
      const { id, ...input } = data;
      const values = { ...input, taxId, address: data.address || null, phone: data.phone || null, email: data.email || null };
      const [organization] = id ? await tx.update(socialNetworkOrganizations).set(values).where(eq(socialNetworkOrganizations.id, id)).returning({ id: socialNetworkOrganizations.id }) : await tx.insert(socialNetworkOrganizations).values(values).returning({ id: socialNetworkOrganizations.id });
      if (!organization) throw new Error("Organização inexistente.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialNetworkOrganization", targetId: organization.id });
    });
    revalidatePath("/social/encaminhamentos"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function registerSocialReferral(input: unknown) {
  try {
    const data = z.object({ unitId: z.string().min(1), personId: z.string(), familyId: z.string(), destinationOrganizationId: z.string().min(1), reasonId: z.string().min(1), priorityTypeId: z.string(), referredAt: socialDateSchema, referenceProfessional: z.string().trim().max(250), objective: z.string().trim().min(3).max(4000), observations: z.string().trim().max(4000) }).refine((value) => Boolean(value.personId) !== Boolean(value.familyId), "Selecione uma pessoa ou uma família.").parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    assertSocialUnitAccess(await resolveSocialAccess(context), data.unitId);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[unit], [destination], [reason]] = await Promise.all([
        tx.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true))),
        tx.select({ id: socialNetworkOrganizations.id }).from(socialNetworkOrganizations).where(and(eq(socialNetworkOrganizations.id, data.destinationOrganizationId), eq(socialNetworkOrganizations.isActive, true))),
        tx.select({ id: socialCatalogEntries.id }).from(socialCatalogEntries).where(and(eq(socialCatalogEntries.id, data.reasonId), eq(socialCatalogEntries.kind, "REFERRAL_REASON"), eq(socialCatalogEntries.isActive, true))),
      ]);
      if (!unit || !destination || !reason) throw new Error("Equipamento, destino ou motivo inativo/inexistente.");
      if (data.personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo")))).length) throw new Error("Pessoa inativa/inexistente.");
      if (data.familyId && !(await tx.select({ id: socialFamilies.id }).from(socialFamilies).where(and(eq(socialFamilies.id, data.familyId), eq(socialFamilies.status, "Ativo")))).length) throw new Error("Família inativa/inexistente.");
      if (data.priorityTypeId && !(await tx.select({ id: socialCatalogEntries.id }).from(socialCatalogEntries).where(and(eq(socialCatalogEntries.id, data.priorityTypeId), eq(socialCatalogEntries.kind, "PRIORITY"), eq(socialCatalogEntries.isActive, true)))).length) throw new Error("Público prioritário inválido.");
      const [referral] = await tx.insert(socialReferrals).values({ ...data, personId: data.personId || null, familyId: data.familyId || null, priorityTypeId: data.priorityTypeId || null, referredAt: new Date(`${data.referredAt}T00:00:00Z`), createdBy: context.user.id }).returning({ id: socialReferrals.id });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialReferral", targetId: referral.id });
    });
    revalidatePath("/social/encaminhamentos"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function returnSocialReferral(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), attendedAt: socialDateSchema, professional: z.string().trim().min(2).max(250), description: z.string().trim().min(3).max(4000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [current] = await tx.select({ referral: socialReferrals, usesCounterReference: socialNetworkOrganizations.usesCounterReference }).from(socialReferrals).innerJoin(socialNetworkOrganizations, eq(socialNetworkOrganizations.id, socialReferrals.destinationOrganizationId)).where(eq(socialReferrals.id, data.id));
      if (!current) throw new Error("Encaminhamento inexistente.");
      assertSocialUnitAccess(access, current.referral.unitId);
      if (!current.usesCounterReference) throw new Error("O órgão de destino não utiliza contrarreferência.");
      if (data.attendedAt < current.referral.referredAt.toISOString().slice(0, 10)) throw new Error("Atendimento anterior ao encaminhamento.");
      const result = await tx.update(socialReferrals).set({ status: "RETURNED", counterReferenceAt: new Date(`${data.attendedAt}T00:00:00Z`), counterReferenceProfessional: data.professional, counterReferenceDescription: data.description, counterReferenceBy: context.user.id }).where(and(eq(socialReferrals.id, data.id), eq(socialReferrals.status, "OPEN"))).returning({ id: socialReferrals.id });
      if (result.length !== 1) throw new Error("Contrarreferência já registrada.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialReferral", targetId: data.id });
    });
    revalidatePath("/social/encaminhamentos"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
