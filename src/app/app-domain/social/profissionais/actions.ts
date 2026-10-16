"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { professionalLinkSchema } from "@/lib/social/professional-input";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { ZodError } from "zod";

export async function saveSocialProfessionalLink(input: unknown) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const data = professionalLinkSchema.parse(input);
    await context.prisma.$transaction(async (tx) => {
      const [employee, unit] = await Promise.all([
        tx.employee.findFirst({ where: { id: data.employeeId, isActive: true }, select: { id: true } }),
        tx.socialUnit.findFirst({ where: { id: data.unitId, isActive: true }, select: { id: true } }),
      ]);
      if (!employee || !unit) throw new Error("Selecione um servidor e um equipamento ativos.");
      const values = { ...data, specialty: data.specialty || null, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, workingDays: [...new Set(data.workingDays)] };
      const link = data.id
        ? await tx.socialProfessionalLink.update({ where: { id: data.id }, data: values })
        : await tx.socialProfessionalLink.create({ data: values });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialProfessionalLink", targetId: link.id });
    });
    revalidatePath("/social/profissionais");
    revalidatePath("/social/prontuario");
    revalidatePath("/social/atendimentos");
    return { success: true };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0].message };
    return { error: "Não foi possível salvar o vínculo. Confira permissões, dados e se já existe vínculo para este servidor/equipamento." };
  }
}
