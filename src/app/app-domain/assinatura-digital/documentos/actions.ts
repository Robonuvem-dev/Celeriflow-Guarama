"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveCentralDocumentType } from "@/lib/signatures/central-service";
import type { CentralDocumentType } from "@/lib/contracts/signature-central";
import { documentTypeInputSchema, serializeDocumentType } from "./cadastro-model";

export async function saveDocumentTypeAction(input: { id?: string; name: string; description: string; active: boolean }): Promise<{ error: string | null; documentType?: CentralDocumentType }> {
  try {
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", input?.id ? "update" : "create");
    const parsed = documentTypeInputSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const documentType = serializeDocumentType(await saveCentralDocumentType(context, parsed.data));
    revalidatePath("/assinatura-digital/documentos");
    return { error: null, documentType };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar o tipo documental." };
  }
}
