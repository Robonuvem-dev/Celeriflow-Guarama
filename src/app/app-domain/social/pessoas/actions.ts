"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess, socialHistoryWhere } from "@/lib/social/access-policy";
import { factSchema, financialEntrySchema, socialDateSchema } from "@/lib/social/history-input";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

function refresh(personId: string) {
  revalidatePath(`/social/pessoas/${personId}`);
  revalidatePath("/social/pessoas");
}
function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (error instanceof Error && error.name.startsWith("Prisma")) return "Não foi possível salvar. Confira duplicidades e integridade dos dados.";
  return error instanceof Error && !error.message.includes("prisma") ? error.message : "Não foi possível salvar o registro.";
}

export async function registerSocialFact(input: unknown) {
  try {
    const data = factSchema.parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const access = await resolveSocialAccess(context);
    assertSocialUnitAccess(access, data.unitId);
    await context.prisma.$transaction(async (tx) => {
      const [catalog, unit, person] = await Promise.all([
        tx.socialCatalogEntry.findFirst({ where: { id: data.catalogId, kind: data.kind, isActive: true } }),
        tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true } }),
        tx.person.findFirst({ where: { id: data.personId, status: "Ativo" } }),
      ]);
      if (!catalog || !unit || !person) throw new Error("Selecione pessoa, equipamento e classificação ativos.");
      if (catalog.allowedUnitTypes.length && !catalog.allowedUnitTypes.includes(unit.type)) throw new Error("Este tipo de equipamento não pode identificar esta classificação.");
      if (await tx.socialPersonFact.findFirst({ where: { personId: data.personId, catalogId: data.catalogId, unitId: data.unitId, endedAt: null } })) throw new Error("Já existe identificação ativa desta classificação no equipamento.");
      const record = await tx.socialPersonFact.create({ data: { ...data, identifiedAt: new Date(`${data.identifiedAt}T00:00:00Z`), createdBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialPersonFact", targetId: record.id });
    });
    refresh(data.personId);
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function endSocialFact(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), endedAt: socialDateSchema, reason: z.string().trim().min(3).max(2000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    const record = await context.prisma.$transaction(async (tx) => {
      const current = await tx.socialPersonFact.findFirst({ where: { id: data.id, ...socialHistoryWhere(access) } });
      if (!current) throw new Error("Registro não encontrado.");
      assertSocialUnitAccess(access, current.unitId);
      if (data.endedAt < current.identifiedAt.toISOString().slice(0, 10)) throw new Error("Encerramento anterior à identificação.");
      const result = await tx.socialPersonFact.updateMany({ where: { id: current.id, endedAt: null }, data: { endedAt: new Date(`${data.endedAt}T00:00:00Z`), endingReason: data.reason, endedBy: context.user.id } });
      if (result.count !== 1) throw new Error("Registro já encerrado. Atualize a página.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialPersonFact", targetId: current.id });
      return current;
    });
    refresh(record.personId);
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function registerSocialFinancialEntry(input: unknown) {
  try {
    const data = financialEntrySchema.parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const access = await resolveSocialAccess(context);
    assertSocialUnitAccess(access, data.unitId);
    await context.prisma.$transaction(async (tx) => {
      const catalog = await tx.socialCatalogEntry.findFirst({ where: { id: data.catalogId, kind: data.kind, isActive: true } });
      const person = await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } });
      const unit = await tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true }, select: { id: true } });
      if (!catalog || !person || !unit) throw new Error("Pessoa, equipamento ou classificação inativa/inexistente.");
      const entry = await tx.socialFinancialEntry.create({ data: { ...data, competence: new Date(`${data.competence}-01T00:00:00Z`), createdBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialFinancialEntry", targetId: entry.id });
    });
    refresh(data.personId);
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function cancelSocialFinancialEntry(input: unknown) {
  try {
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(3).max(2000) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    const record = await context.prisma.$transaction(async (tx) => {
      const current = await tx.socialFinancialEntry.findFirst({ where: { id: data.id, ...socialHistoryWhere(access) } });
      if (!current) throw new Error("Registro não encontrado.");
      assertSocialUnitAccess(access, current.unitId);
      const result = await tx.socialFinancialEntry.updateMany({ where: { id: current.id, cancelledAt: null }, data: { cancelledAt: new Date(), cancellationReason: data.reason, cancelledBy: context.user.id } });
      if (result.count !== 1) throw new Error("Registro já cancelado. Atualize a página.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialFinancialEntry", targetId: current.id });
      return current;
    });
    refresh(record.personId);
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function saveSocialPersonProfile(input: unknown) {
  try {
    const text = z.string().trim().max(250);
    const data = z.object({ personId: z.string().min(1), nis: z.union([z.literal(""), z.string().regex(/^\d{11}$/)]), genderIdentity: text, sexualOrientation: text, workSituation: text, occupation: text, workplace: text, admittedAt: z.union([z.literal(""), socialDateSchema]) }).parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "update");
    const access = await resolveSocialAccess(context);
    if (!access.administrator && !access.links.length) throw new Error("É necessário vínculo social vigente.");
    await context.prisma.$transaction(async (tx) => {
      if (!await tx.person.findUnique({ where: { id: data.personId }, select: { id: true } })) throw new Error("Pessoa não encontrada.");
      const values = { nis: data.nis || null, genderIdentity: data.genderIdentity || null, sexualOrientation: data.sexualOrientation || null, workSituation: data.workSituation || null, occupation: data.occupation || null, workplace: data.workplace || null, admittedAt: data.admittedAt ? new Date(`${data.admittedAt}T00:00:00Z`) : null, lastReviewedAt: new Date() };
      const profile = await tx.socialPersonProfile.upsert({ where: { personId: data.personId }, create: { personId: data.personId, ...values }, update: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialPersonProfile", targetId: profile.id });
    });
    refresh(data.personId);
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
