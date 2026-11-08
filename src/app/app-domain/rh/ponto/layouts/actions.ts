"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { lockPersonnel } from "@/db/repositories/personnel/integration";

export async function savePontoLayout(formData: FormData) {
  const context = await getTenantContextForModuleOperation("RH", "update");
  try {
    const id = formData.get("id") as string | null;
    const name = (formData.get("name") as string)?.trim();
    const code = (formData.get("code") as string)?.trim() || name.toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 30);
    const delimiter = (formData.get("delimiter") as string) || ";";
    const employeeIdCol = (formData.get("employeeIdCol") as string)?.trim() || "1";
    const dateCol = (formData.get("dateCol") as string)?.trim() || "2";
    const dateFormat = (formData.get("dateFormat") as string) || "DD/MM/AAAA";
    const timeCol = (formData.get("timeCol") as string)?.trim() || "3";
    const timeFormat = (formData.get("timeFormat") as string) || "HH:MM";
    const eventCol = (formData.get("eventCol") as string)?.trim() || "";
    const clockCol = (formData.get("clockCol") as string)?.trim() || "";
    const skipHeaderRows = (formData.get("skipHeaderRows") as string)?.trim() || "0";
    const notes = (formData.get("notes") as string)?.trim() || "";

    if (!name) {
      return { success: false, error: "Nome do layout é obrigatório." };
    }

    const details = {
      delimiter,
      employeeIdCol,
      dateCol,
      dateFormat,
      timeCol,
      timeFormat,
      eventCol,
      clockCol,
      skipHeaderRows,
      notes,
    };

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockPersonnel(tx, "functional-configuration");
      if (id) {
        await tx
          .update(hrReferenceRecords)
          .set({
            name,
            code,
            details,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(hrReferenceRecords.id, id),
              eq(hrReferenceRecords.kind, "LAYOUT_IMPORTACAO_PONTO")
            )
          );
      } else {
        await tx.insert(hrReferenceRecords).values({
          kind: "LAYOUT_IMPORTACAO_PONTO",
          code,
          name,
          details,
        });
      }
    });

    revalidatePath("/rh/ponto/layouts");
    revalidatePath("/rh/ponto/importacao");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar layout de importação:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao salvar layout de importação.",
    };
  }
}

export async function deletePontoLayout(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockPersonnel(tx, "functional-configuration");
      await tx
        .delete(hrReferenceRecords)
        .where(
          and(
            eq(hrReferenceRecords.id, id),
            eq(hrReferenceRecords.kind, "LAYOUT_IMPORTACAO_PONTO")
          )
        );
    });

    revalidatePath("/rh/ponto/layouts");
    revalidatePath("/rh/ponto/importacao");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir layout de importação:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao excluir layout.",
    };
  }
}
