"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { directContractings } from "@/db/schema/procurement-core";

export async function deleteDispensa(id: string) {
  const context = await getTenantContextForModuleOperation("COMPRAS", "delete");
  try {
    const deleted = await (context.database ?? db).delete(directContractings).where(eq(directContractings.id, id)).returning({ id: directContractings.id });
    if (!deleted.length) throw new Error("Dispensa não encontrada.");
    revalidatePath("/compras/licitacoes");
    return { success: true };
  } catch (error) {
    console.error("Error deleting dispensa:", error);
    return { success: false, error: "Falha ao excluir a dispensa." };
  }
}

export async function saveDispensa(formData: FormData) {
  const id = formData.get("id") as string | null;
  const context = await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");
  const type = formData.get("type") as string;
  const status = formData.get("status") as string;
  const justification = formData.get("justification") as string;
  
  const processId = formData.get("processId") as string;
  const supplierId = formData.get("supplierId") as string;
  const value = Number(formData.get("value") || 0);

  if (!processId || !supplierId) {
    return { success: false, error: "Selecione o processo e o fornecedor vinculados." };
  }

  const data = {
    type: type || "Dispensa",
    status: status || "Em Elaboração",
    justification,
    processId,
    supplierId,
    value,
  };

  try {
    if (id) {
      const updated = await (context.database ?? db).update(directContractings).set(data).where(eq(directContractings.id, id)).returning({ id: directContractings.id });
      if (!updated.length) throw new Error("Dispensa não encontrada.");
    } else {
      await (context.database ?? db).insert(directContractings).values(data);
    }
    revalidatePath("/compras/licitacoes");
    return { success: true };
  } catch (error) {
    console.error("Error saving dispensa:", error);
    return { success: false, error: "Falha ao salvar a dispensa." };
  }
}
