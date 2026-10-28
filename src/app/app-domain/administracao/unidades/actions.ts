"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertUnit } from "@/db/repositories/administration/creation";
import { findSecretariatActivation } from "@/db/repositories/administration/structure";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function createUnit(formData: FormData) {
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const secretariatId = formData.get("secretariatId") as string;
  const address = formData.get("address") as string;
  const managerName = formData.get("managerName") as string;

  if (!name || !type || !secretariatId) return { error: "Nome, Tipo e Secretaria são obrigatórios" };

  try {
    const context = await getTenantContextForSystemAdministration();
    const secretariat = await findSecretariatActivation(context.database ?? db, secretariatId);
    if (!secretariat?.isActive) return { error: "A secretaria selecionada deve estar ativa." };
    await withDatabaseTransaction(databaseConnection, async tx => {
      const id = await insertUnit(tx, { name, type, secretariatId, address, managerName });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ADMINISTRATIVE_UNIT", targetId: id });
    });
  } catch {
    return { error: "Erro ao criar unidade" };
  }

  revalidatePath("/administracao/unidades");
  revalidatePath("/administracao"); 
  redirect("/administracao/unidades");
}
