"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertRole } from "@/db/repositories/administration/creation";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function createRole(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const level = String(formData.get("level") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const canSign = formData.get("canSign") === "on";

  if (!name) return { error: "Nome é obrigatório" };

  try {
    const context = await getTenantContextForSystemAdministration();
    await withDatabaseTransaction(databaseConnection, async tx => {
      const id = await insertRole(tx, { name, level, description, canSign });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ROLE", targetId: id });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao criar cargo" };
  }

  revalidatePath("/administracao/cargos");
  revalidatePath("/administracao"); 
  redirect("/administracao/cargos");
}
