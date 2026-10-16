"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveSharedCatalogItem } from "@/lib/compras/shared-catalog";

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
    const { prisma } = await getTenantContextForModuleOperation("COMPRAS", input.id ? "update" : "create");
    await prisma.$transaction(tx => saveSharedCatalogItem(tx, input));
    refreshCatalog();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o catálogo compartilhado." };
  }
}

export async function toggleCatalogItemStatus(id: string, isActive: boolean) {
  try {
    const { prisma } = await getTenantContextForModuleOperation("COMPRAS", "update");
    await prisma.$transaction(async tx => {
      await tx.material.updateMany({ where: { catalogItemId: id }, data: { isActive } });
      await tx.catalogItem.update({ where: { id }, data: { isActive } });
    });
    refreshCatalog();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao alterar a situação do item." };
  }
}
