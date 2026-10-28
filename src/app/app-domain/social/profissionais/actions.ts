"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { professionalLinkSchema } from "@/lib/social/professional-input";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { ZodError } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, eq } from "drizzle-orm";
import { employees } from "@/db/schema/administration";
import { socialProfessionalLinks, socialUnits } from "@/db/schema/social";

export async function saveSocialProfessionalLink(input: unknown) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const data = professionalLinkSchema.parse(input);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[employee], [unit]] = await Promise.all([
        tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, data.employeeId), eq(employees.isActive, true))),
        tx.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.id, data.unitId), eq(socialUnits.isActive, true))),
      ]);
      if (!employee || !unit) throw new Error("Selecione um servidor e um equipamento ativos.");
      const { id, ...input } = data;
      const values = { ...input, specialty: data.specialty || null, startsAt: new Date(`${data.startsAt}T00:00:00Z`), endsAt: data.endsAt ? new Date(`${data.endsAt}T00:00:00Z`) : null, workingDays: [...new Set(data.workingDays)] };
      const [link] = id
        ? await tx.update(socialProfessionalLinks).set(values).where(eq(socialProfessionalLinks.id, id)).returning({ id: socialProfessionalLinks.id })
        : await tx.insert(socialProfessionalLinks).values(values).returning({ id: socialProfessionalLinks.id });
      if (!link) throw new Error("Vínculo inexistente.");
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SocialProfessionalLink", targetId: link.id });
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
