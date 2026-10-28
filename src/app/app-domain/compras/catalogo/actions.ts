"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSharedCatalogItem } from "@/lib/compras/shared-catalog";
import { eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { catalogItems } from "@/db/schema/master-data";
import { materials } from "@/db/schema/assets-stock";
import { PersistenceError } from "@/db/errors";

const catalogInput = z.object({
  id: z.string().nullable(), code: z.string(), name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000), category: z.string().trim().max(200),
  unit: z.string().trim().min(1).max(30), estimatedValue: z.number().finite().nonnegative(),
  isActive: z.boolean(), productKind: z.enum(["MATERIAL", "PATRIMONIO", "SERVICO"]).default("MATERIAL"),
});

function refreshCatalog() {
  for (const path of ["/compras/catalogo", "/compras/solicitacoes", "/compras/processos", "/patrimonio/materiais", "/patrimonio/bens/estoque"]) revalidatePath(path);
}

export async function saveCatalogItem(formData: z.input<typeof catalogInput>) {
  try {
    const input = catalogInput.parse(formData);
    await getTenantContextForModuleOperation("COMPRAS", input.id ? "update" : "create");
    await withDatabaseTransaction(databaseConnection, tx => saveSharedCatalogItem(tx, input));
    refreshCatalog();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o catálogo compartilhado." };
  }
}

export async function toggleCatalogItemStatus(id: string, isActive: boolean) {
  try {
    await getTenantContextForModuleOperation("COMPRAS", "update");
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.update(materials).set({ isActive }).where(eq(materials.catalogItemId, id));
      const [updated] = await tx.update(catalogItems).set({ isActive }).where(eq(catalogItems.id, id)).returning({ id: catalogItems.id });
      if (!updated) throw new PersistenceError("not-found", "Item de catálogo não encontrado.");
    });
    refreshCatalog();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao alterar a situação do item." };
  }
}
