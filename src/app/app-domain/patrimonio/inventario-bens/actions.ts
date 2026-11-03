"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { operateAssetInventory } from "@/lib/patrimonio/asset-inventory";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function assetInventoryAction(form: FormData): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("PATRIMONIO", "update");
  let sessionId: string;
  try { sessionId = await operateAssetInventory(databaseConnection, user, Object.fromEntries(form)); }
  catch (error) { redirect(`/patrimonio/inventario-bens?error=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível operar o inventário.")}`); }
  revalidatePath("/patrimonio/inventario-bens");
  revalidatePath("/patrimonio/bens");
  redirect(`/patrimonio/inventario-bens?session=${encodeURIComponent(sessionId)}`);
}
