"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { parsePharmacyInvoice } from "@/lib/saude/pharmacy-invoice";
import { importPharmacyInvoice } from "@/lib/saude/pharmacy-invoice-service";

export async function previewPharmacyInvoiceAction(content: string) {
  try {
    await getTenantContextForModuleOperation("SAUDE", "create");
    return { invoice: parsePharmacyInvoice(content) };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível ler a NF-e." }; }
}
export async function importPharmacyInvoiceAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    const receipt = await importPharmacyInvoice(context, raw);
    revalidatePath("/saude/farmacia"); revalidatePath("/saude/farmacia/notas"); revalidatePath("/patrimonio/materiais");
    return { receipt };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Revise o mapeamento da NF-e." : error instanceof Error ? error.message : "Não foi possível importar a NF-e." }; }
}
