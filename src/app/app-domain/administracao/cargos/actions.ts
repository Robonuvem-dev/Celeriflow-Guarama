"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function createRole(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const level = String(formData.get("level") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const canSign = formData.get("canSign") === "on";

  if (!name) return { error: "Nome é obrigatório" };

  try {
    const context = await getTenantContextForSystemAdministration();
    await context.prisma.$transaction(async (tx) => {
      const duplicate = await tx.role.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (duplicate) throw new Error("Já existe um cargo ou função com este nome. Edite ou reative o registro existente.");
      const role = await tx.role.create({ data: { name, level, description, canSign } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ROLE", targetId: role.id });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao criar cargo" };
  }

  revalidatePath("/administracao/cargos");
  revalidatePath("/administracao"); 
  redirect("/administracao/cargos");
}
