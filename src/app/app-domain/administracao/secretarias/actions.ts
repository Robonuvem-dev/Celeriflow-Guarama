"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { resolveSecretariatManager, secretariatInputSchema } from "@/lib/administration/secretariat-manager";

export async function createSecretariat(formData: FormData) {
  const parsed = secretariatInputSchema.safeParse({ name: formData.get("name"), acronym: formData.get("acronym") || "", managerId: formData.get("managerId") || null });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const context = await getTenantContextForSystemAdministration();
    await context.prisma.$transaction(async (tx) => {
      const secretariat = await tx.secretariat.create({ data: { name: parsed.data.name, acronym: parsed.data.acronym } });
      const manager = await resolveSecretariatManager(tx, secretariat.id, parsed.data.managerId);
      await tx.secretariat.update({ where: { id: secretariat.id }, data: manager });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SECRETARIAT", targetId: secretariat.id });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao criar secretaria" };
  }

  revalidatePath("/administracao/secretarias");
  revalidatePath("/administracao"); 
  revalidatePath("/app-domain/administracao", "layout");
  redirect("/administracao/secretarias");
}
