"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionDate } from "@/lib/obras/construction-rules";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export async function saveConstructionCompanyProfile(input: unknown) {
  try {
    const data = z.object({ companyId: z.string().min(1), startsAt: constructionDate, endsAt: constructionDate, isActive: z.boolean(), legalReference: z.string().trim().min(3).max(2000) }).refine((value) => value.endsAt >= value.startsAt, "Validade anterior ao início.").parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Habilitação de construtoras restrita ao gestor.");
    await context.prisma.$transaction(async (tx) => {
      if (!await tx.company.findFirst({ where: { id: data.companyId, ...(data.isActive ? { status: "Ativo" } : {}) }, select: { id: true } })) throw new Error("Empresa indisponível ou inativa.");
      const values = { startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: new Date(`${data.endsAt}T00:00:00Z`), isActive: data.isActive, legalReference: data.legalReference };
      const previous = await tx.constructionCompanyProfile.findUnique({ where: { companyId: data.companyId } });
      const record = await tx.constructionCompanyProfile.upsert({ where: { companyId: data.companyId }, create: { companyId: data.companyId, ...values, createdBy: context.user.id }, update: values });
      // Full before/after snapshots are preserved as a domain event, rather than overwritten in the authorization history.
      await tx.constructionCompanyProfileEvent.create({ data: { profileId: record.id, actorId: context.user.id, before: previous ? JSON.parse(JSON.stringify(previous)) : {}, after: JSON.parse(JSON.stringify(record)) } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionCompanyProfile", targetId: record.id });
    });
    revalidatePath("/obras/construcao-civil/construtoras"); return { success: true };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível salvar a habilitação." }; }
}
