"use server";

import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { saveHrExternalConfiguration } from "@/lib/rh/external-configuration";

export async function prepareRhEsocialConnection(values: Record<string, string>) {
  const { prisma } = await getTenantContextForSystemAdministration();
  try {
    const connection = await saveHrExternalConfiguration(prisma, values);
    revalidatePath("/rh/esocial");
    return { message: "Configuração registrada sem ativar transmissão.", id: connection.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível preparar a configuração." }; }
}
