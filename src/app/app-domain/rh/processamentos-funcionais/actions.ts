"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { processAutomaticRights } from "@/lib/rh/automatic-rights-processing";

export async function processRightsAction(raw: unknown) {
  try {
    const applying = raw && typeof raw === "object" && "mode" in raw && raw.mode === "APLICAR";
    const context = await getTenantContextForModuleOperation("RH", applying ? "update" : "issueReports");
    const result = await processAutomaticRights(databaseConnection, context, raw);
    if (result.applied) { revalidatePath("/rh/operacoes"); revalidatePath("/rh/relatorios"); }
    return { ...result, error: "" };
  } catch (error) { return { rows: [], applied: false, error: error instanceof Error ? error.message : "Não foi possível processar os direitos." }; }
}
