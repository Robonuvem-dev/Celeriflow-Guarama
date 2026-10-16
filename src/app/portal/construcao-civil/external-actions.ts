"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { getTenantContextForSystemAdministration, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { constructionAuthorizationSchema } from "@/lib/obras/construction-external-policy";
import { openConstructionExternalApplication } from "@/lib/obras/construction-external-opening";
import { submitConstructionServiceRequest } from "@/lib/obras/construction-request-service";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertConstructionExternalCompany } from "@/lib/obras/construction-external-company";
import { resolveConstructionServiceRequest } from "@/lib/obras/construction-request-resolution";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";

function errorMessage(error: unknown) { return error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação."; }
export async function authorizeConstructionExternalOpening(input: unknown) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const data = constructionAuthorizationSchema.parse(input);
    const id = await context.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_AUTHORIZATION:${data.requestKey}`}))`;
      const repeated = await tx.constructionExternalApplication.findUnique({ where: { requestKey: data.requestKey } });
      if (repeated) { if (repeated.authorizedBy !== context.user.id || repeated.identityId !== data.identityId) throw new Error("Referência indisponível."); return repeated.id; }
      if (new Date(data.expiresAt) <= new Date()) throw new Error("Informe uma validade futura.");
      if (!await tx.constructionPortalIdentity.findFirst({ where: { id: data.identityId, isActive: true, professional: { isActive: true } }, select: { id: true } })) throw new Error("Identidade profissional indisponível.");
      if (data.personId && !await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Pessoa requerente indisponível.");
      if (data.companyId && !await tx.company.findFirst({ where: { id: data.companyId, status: "Ativo" }, select: { id: true } })) throw new Error("Empresa requerente indisponível.");
      await assertConstructionExternalCompany(tx, data.identityId, data.companyId || null);
      if (await tx.realEstate.count({ where: { id: { in: data.propertyIds } } }) !== data.propertyIds.length) throw new Error("Imóveis indisponíveis.");
      const config = await tx.constructionConfigVersion.findFirst({ orderBy: { version: "desc" }, select: { subjectIds: true } });
      if (!config || data.subjectIds.some((id) => !config.subjectIds.includes(id)) || await tx.subject.count({ where: { id: { in: data.subjectIds }, isActive: true, processType: { isActive: true, genericWorkflowEnabled: false } } }) !== data.subjectIds.length) throw new Error("Selecione assuntos urbanísticos ativos com fluxo de etapas compatível com abertura externa.");
      const application = await tx.constructionExternalApplication.create({ data: { ...data, personId: data.personId || null, companyId: data.companyId || null, expiresAt: new Date(data.expiresAt), authorizedBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionExternalApplication", targetId: application.id });
      return application.id;
    });
    revalidatePath("/portal/construcao-civil/nova"); return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function revokeConstructionExternalOpening(input: unknown) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const data = z.object({ id: z.string().min(1), reason: z.string().trim().min(10).max(4000) }).parse(input);
    await context.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ConstructionExternalApplication" WHERE "id"=${data.id} FOR UPDATE`;
      const current = await tx.constructionExternalApplication.findUnique({ where: { id: data.id } });
      if (!current || current.caseId) throw new Error("Autorização inexistente ou já protocolada.");
      await tx.constructionExternalApplication.update({ where: { id: data.id }, data: { revokedAt: new Date(), revokedReason: data.reason } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionExternalApplication", targetId: data.id });
    });
    revalidatePath("/portal/construcao-civil/nova"); return { success: true };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function openExternalConstructionCase(input: unknown) {
  try {
    const identity = await getConstructionPortalIdentity();
    const id = await prisma.$transaction((tx) => openConstructionExternalApplication(tx, identity.id, input));
    revalidatePath("/portal/construcao-civil"); revalidatePath("/obras/construcao-civil"); revalidatePath("/protocolos/processos");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function requestConstructionService(input: unknown) {
  try {
    const identity = await getConstructionPortalIdentity();
    const id = await prisma.$transaction((tx) => submitConstructionServiceRequest(tx, identity.id, input));
    revalidatePath("/portal/construcao-civil", "layout"); revalidatePath("/obras/construcao-civil", "layout");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function attendConstructionServiceRequest(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    const id = await context.prisma.$transaction((tx) => resolveConstructionServiceRequest(tx, access, context.user.id, input));
    revalidatePath("/portal/construcao-civil", "layout"); revalidatePath("/obras/construcao-civil", "layout");
    return { success: true, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
