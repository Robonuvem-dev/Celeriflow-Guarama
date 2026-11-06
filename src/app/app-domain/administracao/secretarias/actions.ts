"use server";
import { getTenantContextForModuleOperation, getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertSecretariat, insertUnit } from "@/db/repositories/administration/creation";
import { secretariats } from "@/db/schema/administration";
import { eq } from "drizzle-orm";
import { resolveSecretariatManager } from "@/db/repositories/administration/leadership";
import { updateSecretariat } from "@/db/repositories/administration/structure";
import { secretariatInputSchema } from "@/lib/administration/secretariat-input";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

async function resolveAdminCreateContext() {
  try {
    return await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
  } catch {
    return await getTenantContextForSystemAdministration();
  }
}

export async function createSecretariat(formData: FormData) {
  const entityKind = String(formData.get("entityKind") || "SECRETARIA").trim();
  const parentSecretariatId = String(formData.get("parentSecretariatId") || "").trim();
  const unitType = String(formData.get("unitType") || "Órgão Administrativo").trim();
  const address = String(formData.get("address") || "").trim() || null;
  const managerName = String(formData.get("managerName") || "").trim() || null;

  if (entityKind === "UNIDADE_VINCULADA" && parentSecretariatId) {
    const rawName = String(formData.get("name") || "").trim();
    if (!rawName) return { error: "Nome do órgão administrativo ou unidade é obrigatório." };
    try {
      const context = await resolveAdminCreateContext();
      await withDatabaseTransaction(databaseConnection, async (tx) => {
        const unitId = await insertUnit(tx, {
          name: rawName,
          type: unitType || "Órgão Administrativo",
          secretariatId: parentSecretariatId,
          address,
          managerName,
        });
        await insertAuditEvent(tx, {
          actorUsuarioId: context.user.id,
          eventType: auditEventTypes.administrativeMutation,
          targetType: "ADMINISTRATIVE_UNIT",
          targetId: unitId,
        });
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Erro ao criar órgão administrativo" };
    }
    revalidatePath("/administracao/secretarias");
    revalidatePath("/administracao/unidades");
    revalidatePath("/protocolos/estrutura");
    revalidatePath("/administracao");
    revalidatePath("/app-domain/administracao", "layout");
    redirect("/administracao/secretarias");
  }

  const parsed = secretariatInputSchema.safeParse({
    name: formData.get("name"),
    acronym: formData.get("acronym") || "",
    managerId: formData.get("managerId") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const context = await resolveAdminCreateContext();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const id = await insertSecretariat(tx, { name: parsed.data.name, acronym: parsed.data.acronym });
      const manager = await resolveSecretariatManager(tx, id, parsed.data.managerId);
      await updateSecretariat(tx, id, { name: parsed.data.name, acronym: parsed.data.acronym, ...manager });
      await insertAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "SECRETARIAT",
        targetId: id,
      });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao criar secretaria ou órgão administrativo" };
  }

  revalidatePath("/administracao/secretarias");
  revalidatePath("/protocolos/estrutura");
  revalidatePath("/administracao");
  revalidatePath("/app-domain/administracao", "layout");
  redirect("/administracao/secretarias");
}

export async function updateSecretariatFull(id: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const acronym = String(formData.get("acronym") || "").trim();
  const managerId = String(formData.get("managerId") || "").trim() || null;
  const isActive = formData.get("isActive") === "true" || formData.get("isActive") === "on" || formData.get("isActive") === "1";

  if (!name) return { error: "Nome da secretaria é obrigatório." };

  try {
    const context = await resolveAdminCreateContext();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const manager = await resolveSecretariatManager(tx, id, managerId);
      await updateSecretariat(tx, id, { name, acronym, ...manager });
      if (typeof isActive === "boolean") {
        await tx.update(secretariats).set({ isActive }).where(eq(secretariats.id, id));
      }
      await insertAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "SECRETARIAT",
        targetId: id,
      });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao atualizar secretaria" };
  }

  revalidatePath("/administracao/secretarias");
  revalidatePath("/portal/secretarias");
  revalidatePath("/protocolos/estrutura");
  revalidatePath("/administracao");
  revalidatePath("/app-domain/administracao", "layout");
  redirect("/administracao/secretarias");
}
