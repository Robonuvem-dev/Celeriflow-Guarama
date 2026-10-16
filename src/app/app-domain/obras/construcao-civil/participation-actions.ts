"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForSystemAdministration, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { adminAuth } from "@/lib/firebase/server";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível salvar. Confira as referências e duplicidades."; }
export async function saveConstructionPortalIdentity(input: unknown) {
  try {
    const data = z.object({ professionalId: z.string().min(1), firebaseUid: z.string().trim().min(1).max(128), email: z.email().transform((value) => value.toLowerCase()), isActive: z.boolean() }).parse(input);
    const context = await getTenantContextForSystemAdministration();
    if (data.isActive) {
      const account = await adminAuth.getUser(data.firebaseUid);
      if (account.disabled || !account.emailVerified || account.email?.toLowerCase() !== data.email) throw new Error("UID e e-mail devem corresponder à mesma conta Firebase ativa e verificada.");
    }
    await context.prisma.$transaction(async (tx) => {
      const current = await tx.constructionPortalIdentity.findUnique({ where: { professionalId: data.professionalId } });
      if (current && (current.firebaseUid !== data.firebaseUid || current.email !== data.email)) throw new Error("Identidade já vinculada. A identidade de autenticação é imutável neste cadastro.");
      const record = await tx.constructionPortalIdentity.upsert({ where: { professionalId: data.professionalId }, create: { ...data, createdBy: context.user.id }, update: { isActive: data.isActive } });
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
    await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('CONSTRUCTION_TERM'))`;
      const latest = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
      const record = await tx.constructionTermVersion.create({ data: { text, version: (latest?.version || 0) + 1, publishedBy: context.user.id } });
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
    await context.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
      const item = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionCaseWhere(access)] }, select: { id: true, processId: true } });
      if (!item) throw new Error("Solicitação fora do seu setor.");
      const identity = await tx.constructionPortalIdentity.findUnique({ where: { id: data.identityId }, include: { professional: { include: { person: { select: { status: true } } } } } });
      if (data.isActive && (!identity?.isActive || !identity.professional.isActive)) throw new Error("Identidade/profissional inativo.");
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      if (data.isActive && identity && (identity.professional.person.status !== "Ativo" || identity.professional.startsAt > today || (identity.professional.endsAt && identity.professional.endsAt < today))) throw new Error("Perfil profissional fora da vigência ou pessoa inativa.");
      if (data.isActive && (data.role === "BROKER") !== (identity?.professional.professionalType === "BROKER")) throw new Error("Papel incompatível com o perfil profissional.");
      const current = await tx.constructionParticipant.findFirst({ where: { caseId: data.caseId, identityId: data.identityId, isActive: true } });
      if (data.isActive && current) throw new Error("Profissional já participa. Encerre o vínculo antes de alterar o papel.");
      if (!data.isActive && !current) throw new Error("Participação ativa não encontrada.");
      const record = data.isActive ? await tx.constructionParticipant.create({ data: { ...data, createdBy: context.user.id } }) : await tx.constructionParticipant.update({ where: { id: current!.id }, data: { isActive: false, endsAt: new Date() } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionParticipant", targetId: record.id });
      await tx.processEvent.create({ data: { processId: item.processId, eventType: data.isActive ? "CONSTRUCTION_PARTICIPANT_ADDED" : "CONSTRUCTION_PARTICIPANT_ENDED", description: data.reason, departmentId: access.departmentId, employeeId: access.employeeId, metadata: JSON.stringify({ participantId: record.id, identityId: data.identityId }) } });
    });
    revalidatePath("/obras/construcao-civil/participacao"); revalidatePath("/portal/construcao-civil"); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
