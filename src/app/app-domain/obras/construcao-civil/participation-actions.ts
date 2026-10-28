"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionParticipants, constructionPortalIdentities, constructionProfessionals } from "@/db/schema/construction-core";
import { constructionTerms } from "@/db/schema/construction-portal";
import { people } from "@/db/schema/people";
import { processEvents } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { getTenantContextForSystemAdministration, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { adminAuth } from "@/lib/firebase/server";

function message(error: unknown) { return constructionActionMessage(error, "Não foi possível salvar. Confira as referências e duplicidades."); }
export async function saveConstructionPortalIdentity(input: unknown) {
  try {
    const data = z.object({ professionalId: z.string().min(1), firebaseUid: z.string().trim().min(1).max(128), email: z.email().transform((value) => value.toLowerCase()), isActive: z.boolean() }).parse(input);
    const context = await getTenantContextForSystemAdministration();
    if (data.isActive) {
      const account = await adminAuth.getUser(data.firebaseUid);
      if (account.disabled || !account.emailVerified || account.email?.toLowerCase() !== data.email) throw new Error("UID e e-mail devem corresponder à mesma conta Firebase ativa e verificada.");
    }
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [current] = await tx.select().from(constructionPortalIdentities).where(eq(constructionPortalIdentities.professionalId, data.professionalId)).limit(1);
      if (current && (current.firebaseUid !== data.firebaseUid || current.email !== data.email)) throw new Error("Identidade já vinculada. A identidade de autenticação é imutável neste cadastro.");
      const [record] = await tx.insert(constructionPortalIdentities).values({ ...data, createdBy: context.user.id }).onConflictDoUpdate({ target: constructionPortalIdentities.professionalId, set: { isActive: data.isActive } }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionPortalIdentity", targetId: record.id });
    });
    revalidatePath("/obras/construcao-civil/participacao"); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function publishConstructionTerm(input: unknown) {
  try {
    const { text } = z.object({ text: z.string().trim().min(30).max(20000) }).parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Publicação restrita ao gestor urbanístico.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('CONSTRUCTION_TERM'))`);
      const [latest] = await tx.select({ version: constructionTerms.version }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
      const [record] = await tx.insert(constructionTerms).values({ text, version: (latest?.version || 0) + 1, publishedBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "ConstructionTermVersion", targetId: record.id });
    });
    revalidatePath("/obras/construcao-civil/participacao"); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function saveConstructionParticipant(input: unknown) {
  try {
    const data = z.object({ caseId: z.string().min(1), identityId: z.string().min(1), role: z.enum(["TECHNICAL", "BROKER", "REPRESENTATIVE"]), isActive: z.boolean(), reason: z.string().trim().min(10).max(2000) }).parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Participação restrita ao gestor urbanístico.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
      const item = await findConstructionCaseForAccess(tx, data.caseId, access);
      if (!item) throw new Error("Solicitação fora do seu setor.");
      const [identity] = await tx.select({ isActive: constructionPortalIdentities.isActive, professional: getTableColumns(constructionProfessionals), personStatus: people.status }).from(constructionPortalIdentities).innerJoin(constructionProfessionals, eq(constructionProfessionals.id, constructionPortalIdentities.professionalId)).innerJoin(people, eq(people.id, constructionProfessionals.personId)).where(eq(constructionPortalIdentities.id, data.identityId)).limit(1);
      if (data.isActive && (!identity?.isActive || !identity.professional.isActive)) throw new Error("Identidade/profissional inativo.");
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      if (data.isActive && identity && (identity.personStatus !== "Ativo" || identity.professional.startsAt > today || (identity.professional.endsAt && identity.professional.endsAt < today))) throw new Error("Perfil profissional fora da vigência ou pessoa inativa.");
      if (data.isActive && (data.role === "BROKER") !== (identity?.professional.professionalType === "BROKER")) throw new Error("Papel incompatível com o perfil profissional.");
      const [current] = await tx.select().from(constructionParticipants).where(and(eq(constructionParticipants.caseId, data.caseId), eq(constructionParticipants.identityId, data.identityId), eq(constructionParticipants.isActive, true))).limit(1);
      if (data.isActive && current) throw new Error("Profissional já participa. Encerre o vínculo antes de alterar o papel.");
      if (!data.isActive && !current) throw new Error("Participação ativa não encontrada.");
      const [record] = data.isActive ? await tx.insert(constructionParticipants).values({ ...data, createdBy: context.user.id }).returning() : await tx.update(constructionParticipants).set({ isActive: false, endsAt: new Date() }).where(eq(constructionParticipants.id, current!.id)).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionParticipant", targetId: record.id });
      await tx.insert(processEvents).values({ processId: item.processId, eventType: data.isActive ? "CONSTRUCTION_PARTICIPANT_ADDED" : "CONSTRUCTION_PARTICIPANT_ENDED", description: data.reason, departmentId: access.departmentId, employeeId: access.employeeId, metadata: JSON.stringify({ participantId: record.id, identityId: data.identityId }) });
    });
    revalidatePath("/obras/construcao-civil/participacao"); revalidatePath("/portal/construcao-civil"); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
