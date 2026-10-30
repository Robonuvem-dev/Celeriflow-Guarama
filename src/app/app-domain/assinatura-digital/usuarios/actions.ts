"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveCentralSigner } from "@/lib/signatures/central-service";
import type { CentralSigner, CentralSignerInput } from "@/lib/contracts/signature-central";
import { serializeSigner, signerInputSchema } from "./cadastro-model";

export async function saveSignerAction(input: CentralSignerInput): Promise<{ error: string | null; signer?: CentralSigner }> {
  try {
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", input?.id ? "update" : "create");
    const parsed = signerInputSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const signer = serializeSigner(await saveCentralSigner(context, parsed.data));
    revalidatePath("/assinatura-digital/usuarios");
    return { error: null, signer };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar o usuário." };
  }
}
