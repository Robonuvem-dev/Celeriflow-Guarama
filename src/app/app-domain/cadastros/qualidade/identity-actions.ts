"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { reconcileCanonicalIdentity } from "@/lib/cadastros/identity-reconciliation";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

export async function reconcileIdentityAction(input: Record<string, string>): Promise<{ error?: string }> {
  try {
    const context = await getTenantContextForModuleOperation("CADASTROS", "update");
    await reconcileCanonicalIdentity(context, Object.fromEntries(Object.entries(input).filter(([, value]) => value.trim() !== "")));
    for (const path of ["/app-domain/cadastros/qualidade", "/app-domain/cadastros/fornecedores", "/app-domain/financeiro/credores", "/app-domain/tributacao/contribuintes"]) revalidatePath(path);
    return {};
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Dados de reconciliação inválidos." };
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { error: error.code === "P2002" ? "Vínculo já utilizado por outro cadastro; preserve os registros até conciliação." : "Cadastro indisponível ou vínculo incompatível." };
    return { error: error instanceof Error && !error.message.includes("Invalid `") ? error.message : "Não foi possível reconciliar a identidade." };
  }
}
