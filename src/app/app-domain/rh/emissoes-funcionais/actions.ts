"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { publishFunctionalDocument, revokeFunctionalDocument } from "@/lib/portal-servidor/document-publication";

export async function publishFunctionalDocumentAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "issueReports");
    await publishFunctionalDocument(context, raw);
    revalidatePath("/rh/emissoes-funcionais"); revalidatePath("/portal-servidor/emissoes");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível disponibilizar o documento." }; }
}

export async function revokeFunctionalDocumentAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "issueReports");
    await revokeFunctionalDocument(context, raw);
    revalidatePath("/rh/emissoes-funcionais"); revalidatePath("/portal-servidor/emissoes");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível revogar o documento." }; }
}
