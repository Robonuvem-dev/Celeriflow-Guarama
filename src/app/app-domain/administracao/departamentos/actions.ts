"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertDepartment } from "@/db/repositories/administration/creation";
import { findSecretariatActivation } from "@/db/repositories/administration/structure";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function createDepartment(formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const secretariatId = formData.get("secretariatId") as string;

  if (!name || !secretariatId) return { error: "Nome e Secretaria são obrigatórios" };

  try {
    const context = await getTenantContextForSystemAdministration();
    const secretariat = await findSecretariatActivation(context.database ?? db, secretariatId);
    if (!secretariat?.isActive) return { error: "A secretaria selecionada deve estar ativa." };
    await withDatabaseTransaction(databaseConnection, async tx => {
      const id = await insertDepartment(tx, { name, description, secretariatId });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "DEPARTMENT", targetId: id });
    });
  } catch {
    return { error: "Erro ao criar departamento" };
  }

  revalidatePath("/administracao/departamentos");
  revalidatePath("/administracao"); 
  redirect("/administracao/departamentos");
}
