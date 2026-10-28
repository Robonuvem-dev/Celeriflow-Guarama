"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { assertPersonnelActNotIntegrated } from "@/lib/rh/functional-occurrences";
import { eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { personnelActs } from "@/db/schema/personnel-records";

export async function saveAtoPessoal(formData: FormData) {
  const id = formData.get("id") as string | null;
  await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const type = formData.get("type") as string;
    const date = formData.get("date") as string;
    const actNumber = formData.get("actNumber") as string;
    const documentUrl = formData.get("documentUrl") as string;

    if (!employeeId || !type || !date) {
      return { success: false, error: "Servidor, Tipo e Data são obrigatórios." };
    }

    const data = {
      employeeId,
      type,
      date: new Date(date),
      actNumber: actNumber || null,
      documentUrl: documentUrl || null,
    };

    if (id) {
      await withDatabaseTransaction(databaseConnection, async tx => {
        await assertPersonnelActNotIntegrated(tx, id);
        const [updated] = await tx.update(personnelActs).set(data).where(eq(personnelActs.id, id)).returning({ id: personnelActs.id });
        if (!updated) throw new Error("Ato de pessoal não encontrado.");
      });
    } else {
      await databaseConnection.db.insert(personnelActs).values(data);
    }

    revalidatePath("/rh/atos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar ato de pessoal:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o ato de pessoal." };
  }
}

export async function deleteAtoPessoal(id: string) {
  await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      await assertPersonnelActNotIntegrated(tx, id);
      const [removed] = await tx.delete(personnelActs).where(eq(personnelActs.id, id)).returning({ id: personnelActs.id });
      if (!removed) throw new Error("Ato de pessoal não encontrado.");
    });
    revalidatePath("/rh/atos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir ato de pessoal:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o ato de pessoal." };
  }
}
