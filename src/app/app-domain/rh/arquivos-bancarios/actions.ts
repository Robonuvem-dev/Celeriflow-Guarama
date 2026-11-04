"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { generateBankFile } from "@/lib/rh/bank-file-service";

export async function generateBankFileAction(values: Record<string, string>) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "issueReports");
    const result = await generateBankFile(databaseConnection, context, values);
    revalidatePath("/rh/arquivos-bancarios");
    return { id: result.id, error: "" };
  } catch (error) { return { id: "", error: error instanceof Error ? error.message : "Não foi possível gerar o arquivo bancário." }; }
}
