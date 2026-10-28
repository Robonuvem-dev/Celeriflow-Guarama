"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess, socialHistoryWhere } from "@/lib/social/access-policy";
import { factSchema, financialEntrySchema, socialDateSchema } from "@/lib/social/history-input";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { Decimal } from "@/db/decimal";
import { and, eq, isNull } from "drizzle-orm";
import { people } from "@/db/schema/people";
import { socialCatalogEntries, socialUnits, socialPersonFacts, socialFinancialEntries, socialPersonProfiles } from "@/db/schema/social";

function refresh(personId: string) {
  revalidatePath(`/social/pessoas/${personId}`);
  revalidatePath("/social/pessoas");
}
function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  if (getPostgresError(error)) return "Não foi possível salvar. Confira duplicidades e integridade dos dados.";
  return error instanceof Error ? error.message : "Não foi possível salvar o registro.";
}

export async function registerSocialFact(input: unknown) {
  try {
    const data = factSchema.parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const access = await resolveSocialAccess(context);
    assertSocialUnitAccess(access, data.unitId);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[catalog], [unit], [person]] = await Promise.all([
        tx.select().from(socialCatalogEntries).where(and(eq(socialCatalogEntries.id, data.catalogId), eq(socialCatalogEntries.kind, data.kind), eq(socialCatalogEntries.isActive, true))),
        tx.select().from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true))),
        tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo"))),
      ]);
      if (!catalog || !unit || !person) throw new Error("Selecione pessoa, equipamento e classificação ativos.");
      if (catalog.allowedUnitTypes.length && !catalog.allowedUnitTypes.includes(unit.type)) throw new Error("Este tipo de equipamento não pode identificar esta classificação.");
      if ((await tx.select({ id: socialPersonFacts.id }).from(socialPersonFacts).where(and(eq(socialPersonFacts.personId, data.personId), eq(socialPersonFacts.catalogId, data.catalogId), eq(socialPersonFacts.unitId, data.unitId), isNull(socialPersonFacts.endedAt))).limit(1)).length) throw new Error("Já existe identificação ativa desta classificação no equipamento.");
      const [record] = await tx.insert(socialPersonFacts).values({ ...data, identifiedAt: new Date(`${data.identifiedAt}T00:00:00Z`), createdBy: context.user.id }).returning({ id: socialPersonFacts.id });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialPersonFact", targetId: record.id });
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
    const record = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [current] = await tx.select().from(socialPersonFacts).where(and(eq(socialPersonFacts.id, data.id), socialHistoryWhere(access)));
      if (!current) throw new Error("Registro não encontrado.");
      assertSocialUnitAccess(access, current.unitId);
      if (data.endedAt < current.identifiedAt.toISOString().slice(0, 10)) throw new Error("Encerramento anterior à identificação.");
      const result = await tx.update(socialPersonFacts).set({ endedAt: new Date(`${data.endedAt}T00:00:00Z`), endingReason: data.reason, endedBy: context.user.id }).where(and(eq(socialPersonFacts.id, current.id), isNull(socialPersonFacts.endedAt))).returning({ id: socialPersonFacts.id });
      if (result.length !== 1) throw new Error("Registro já encerrado. Atualize a página.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialPersonFact", targetId: current.id });
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
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [catalog] = await tx.select({ id: socialCatalogEntries.id }).from(socialCatalogEntries).where(and(eq(socialCatalogEntries.id, data.catalogId), eq(socialCatalogEntries.kind, data.kind), eq(socialCatalogEntries.isActive, true)));
      const [person] = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo")));
      const [unit] = await tx.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true)));
      if (!catalog || !person || !unit) throw new Error("Pessoa, equipamento ou classificação inativa/inexistente.");
      const [entry] = await tx.insert(socialFinancialEntries).values({ ...data, value: new Decimal(data.value), competence: new Date(`${data.competence}-01T00:00:00Z`), createdBy: context.user.id }).returning({ id: socialFinancialEntries.id });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialFinancialEntry", targetId: entry.id });
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
    const record = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [current] = await tx.select().from(socialFinancialEntries).where(and(eq(socialFinancialEntries.id, data.id), socialHistoryWhere(access, socialFinancialEntries)));
      if (!current) throw new Error("Registro não encontrado.");
      assertSocialUnitAccess(access, current.unitId);
      const result = await tx.update(socialFinancialEntries).set({ cancelledAt: new Date(), cancellationReason: data.reason, cancelledBy: context.user.id }).where(and(eq(socialFinancialEntries.id, current.id), isNull(socialFinancialEntries.cancelledAt))).returning({ id: socialFinancialEntries.id });
      if (result.length !== 1) throw new Error("Registro já cancelado. Atualize a página.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialFinancialEntry", targetId: current.id });
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
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (!(await tx.select({ id: people.id }).from(people).where(eq(people.id, data.personId))).length) throw new Error("Pessoa não encontrada.");
      const values = { nis: data.nis || null, genderIdentity: data.genderIdentity || null, sexualOrientation: data.sexualOrientation || null, workSituation: data.workSituation || null, occupation: data.occupation || null, workplace: data.workplace || null, admittedAt: data.admittedAt ? new Date(`${data.admittedAt}T00:00:00Z`) : null, lastReviewedAt: new Date() };
      const [profile] = await tx.insert(socialPersonProfiles).values({ personId: data.personId, ...values }).onConflictDoUpdate({ target: socialPersonProfiles.personId, set: values }).returning({ id: socialPersonProfiles.id });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialPersonProfile", targetId: profile.id });
    });
    refresh(data.personId);
    return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
