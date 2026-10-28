"use server";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertSecretariat } from "@/db/repositories/administration/creation";
import { resolveSecretariatManager } from "@/db/repositories/administration/leadership";
import { updateSecretariat } from "@/db/repositories/administration/structure";
import { secretariatInputSchema } from "@/lib/administration/secretariat-input";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function createSecretariat(formData: FormData) {
  const parsed = secretariatInputSchema.safeParse({ name: formData.get("name"), acronym: formData.get("acronym") || "", managerId: formData.get("managerId") || null });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const context = await getTenantContextForSystemAdministration();
    await withDatabaseTransaction(databaseConnection, async tx => {
      const id = await insertSecretariat(tx, { name: parsed.data.name, acronym: parsed.data.acronym });
      const manager = await resolveSecretariatManager(tx, id, parsed.data.managerId);
      await updateSecretariat(tx, id, { name: parsed.data.name, acronym: parsed.data.acronym, ...manager });
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SECRETARIAT", targetId: id });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao criar secretaria" };
  }

  revalidatePath("/administracao/secretarias");
  revalidatePath("/administracao"); 
  revalidatePath("/app-domain/administracao", "layout");
  redirect("/administracao/secretarias");
}
