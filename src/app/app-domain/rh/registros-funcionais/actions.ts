"use server";

import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveFunctionalRecord } from "@/lib/rh/functional-record-service";

export async function saveFunctionalRecordAction(raw: unknown): Promise<{ error?: string; id?: string }> {
  try {
    const editing = !!(raw && typeof raw === "object" && "id" in raw && raw.id);
    const context = await getTenantContextForModuleOperation("RH", editing ? "update" : "create");
    const record = await saveFunctionalRecord(databaseConnection, context, raw);
    revalidatePath("/rh/registros-funcionais"); revalidatePath("/rh/relatorios");
    return { id: record.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o registro." }; }
}
