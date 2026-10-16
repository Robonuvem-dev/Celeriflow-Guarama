"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { decideCitizenAccess } from "@/lib/portal-cidadao/registration";

export async function decideCitizenAccessAction(raw: unknown): Promise<{ error: string | null }> {
  try { const context = await getTenantContextForSystemAdministration(); await decideCitizenAccess(context.prisma, context.user.id, raw); revalidatePath("/app-domain/protocolos/servicos/acessos"); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível decidir." }; }
}
