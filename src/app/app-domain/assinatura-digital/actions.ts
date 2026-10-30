"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getIdTokenPrincipal } from "@/lib/platform/session";
import { registerInternalDocumentSignature } from "@/lib/signatures/internal-signature";

export async function signPendingDocument(documentId: string, reauthenticationToken: string): Promise<{ error: string | null }> {
  try {
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", "create");
    if (!documentId || !reauthenticationToken) throw new Error("Selecione o documento e confirme sua senha.");
    const principal = await getIdTokenPrincipal(reauthenticationToken);
    if (!principal || principal.firebaseUid !== context.user.firebaseUid) throw new Error("A confirmação de senha não corresponde à sessão atual.");
    const age = Date.now() - principal.authTime * 1000;
    if (age > 300_000 || age < -30_000) throw new Error("A confirmação de senha expirou. Informe sua senha novamente.");
    const requestHeaders = await headers();
    await registerInternalDocumentSignature(context, documentId, {
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: requestHeaders.get("user-agent"),
    }, new Date());
    revalidatePath("/assinatura-digital");
    revalidatePath("/assinatura-digital/pendentes");
    revalidatePath("/assinatura-digital/historico");
    revalidatePath("/documentos/assinaturas");
    revalidatePath("/documentos/ged");
    revalidatePath("/protocolos/assinaturas");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível registrar a assinatura." };
  }
}
