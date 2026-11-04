"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { saveCanonicalDependent } from "@/lib/rh/dependent-service";
import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { dependents } from "@/db/schema/personnel-records";
import { assertFunctionalHolderAccess } from "@/lib/rh/functional-record-service";
import { withDatabaseTransaction } from "@/db/transaction";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { auditPersonnelMutation } from "@/lib/rh/personnel-mutation-audit";

export async function saveDependente(formData: FormData) {
  const id = formData.get("id") as string | null;
  const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    await assertFunctionalHolderAccess(context.database ?? databaseConnection.db, context, String(formData.get("employeeId") || ""));
    await saveCanonicalDependent(databaseConnection, context.user.id, { id: id || undefined, employeeId: String(formData.get("employeeId") || ""), personId: String(formData.get("personId") || ""), relationship: String(formData.get("relationship") || ""), irrfDependent: formData.get("irrfDependent") === "on", familyWage: formData.get("familyWage") === "on" });

    revalidatePath("/rh/dependentes");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar dependente:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o dependente." };
  }
}

export async function deleteDependente(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      await lockPersonnel(tx, "functional-configuration");
      const [previous] = await tx.select().from(dependents).where(eq(dependents.id, id)).limit(1);
      if (!previous) throw new Error("Dependente não encontrado.");
      await lockPersonnel(tx, `employee:${previous.employeeId}`);
      await assertFunctionalHolderAccess(tx, context, previous.employeeId);
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
      const [removed] = await tx.delete(dependents).where(eq(dependents.id, id)).returning({ id: dependents.id });
      if (!removed) throw new Error("Dependente não encontrado.");
      await auditPersonnelMutation(tx, context.user.id, { employeeId: previous.employeeId, entity: "Dependent", id, operation: "EXCLUIR", before: previous, after: null });
    });
    revalidatePath("/rh/dependentes");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir dependente:", error);
    return { success: false, error: "Falha ao excluir o dependente." };
  }
}
