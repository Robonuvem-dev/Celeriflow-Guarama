"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { nextMaterialCode } from "@/lib/patrimonio/identifiers";
import { materialUnitValues } from "@/lib/patrimonio/material-units";
import { syncMaterialCatalog } from "@/lib/compras/shared-catalog";

const materialEditInput = z.object({
  description: z.string().trim().max(4000).optional(),
  categoryId: z.string().trim().min(1, "Selecione a categoria."),
  subcategoryId: z.string().trim().optional(),
  type: z.enum(["MATERIAL", "PATRIMONIO"]),
  unitOfMeasure: z.string().trim().min(1).max(30),
});

export type MaterialEditInput = z.input<typeof materialEditInput>;
type MaterialActionResult = { error?: string };

function revalidateMaterials() {
  revalidatePath("/patrimonio/materiais");
  revalidatePath("/patrimonio/bens/estoque");
  revalidatePath("/compras/catalogo");
  revalidatePath("/patrimonio/requisicoes/nova");
  revalidatePath("/compras/solicitacoes");
  revalidatePath("/compras/solicitacoes/nova");
  revalidatePath("/patrimonio");
}

export async function updateMaterialAction(id: string, input: MaterialEditInput): Promise<MaterialActionResult> {
  try {
    const parsed = materialEditInput.parse(input);
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const [material, category] = await Promise.all([
      context.prisma.material.findUnique({
        where: { id },
        select: {
          id: true,
          type: true,
          unitOfMeasure: true,
          receiptItems: { select: { quantity: true, quantityIncorporated: true } },
          _count: {
            select: {
              stocks: true,
              movements: true,
              requests: true,
              purchaseRequestItems: true,
              purchaseProcessItems: true,
              receiptItems: true,
              obrasServiceMaterials: true,
            },
          },
        },
      }),
      context.prisma.materialCategory.findFirst({ where: { id: parsed.categoryId, isActive: true }, select: { id: true } }),
    ]);
    if (!material) throw new Error("Material não encontrado.");
    if (!category) throw new Error("Categoria de material não encontrada ou inativa.");
    if (parsed.subcategoryId && !await context.prisma.materialSubcategory.count({ where: { id: parsed.subcategoryId, categoryId: category.id, isActive: true } })) throw new Error("Selecione uma subclasse ativa da categoria informada.");
    const unitOfMeasure = parsed.unitOfMeasure;
    if (unitOfMeasure !== material.unitOfMeasure && !materialUnitValues.some(unit => unit === unitOfMeasure)) throw new Error("Selecione UN, KG, m ou KT.");
    const typeChanged = material.type !== parsed.type;
    const unitChanged = material.unitOfMeasure !== unitOfMeasure;
    const linkedRecords = Object.values(material._count).reduce((total, value) => total + value, 0);
    const hasPendingAssetReceipt = parsed.type === "PATRIMONIO" && material.receiptItems.some((item) => item.quantityIncorporated < item.quantity);
    if (unitChanged && linkedRecords > 0) {
      throw new Error("A unidade de medida não pode ser alterada após o material possuir estoque ou documentos vinculados.");
    }
    if (typeChanged && linkedRecords > 0 && !hasPendingAssetReceipt) {
      throw new Error("O tipo não pode ser alterado após o material possuir estoque ou documentos vinculados.");
    }
    await context.prisma.$transaction(async tx => {
    const code = typeChanged ? await nextMaterialCode(tx, parsed.type) : undefined;
    await tx.material.update({
      where: { id: material.id },
      data: { description: parsed.description || null, categoryId: category.id, subcategoryId: parsed.subcategoryId || null, type: parsed.type, unitOfMeasure, ...(code ? { code } : {}) },
    });
    await syncMaterialCatalog(tx, material.id);
    });
    revalidateMaterials();
    return {};
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Revise os dados do material." : error instanceof Error ? error.message : "Não foi possível atualizar o material." };
  }
}

export async function setMaterialActiveAction(id: string, active: boolean): Promise<MaterialActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const material = await context.prisma.material.findUnique({ where: { id }, select: { id: true } });
    if (!material) throw new Error("Material não encontrado.");
    await context.prisma.$transaction(async tx => {
      await tx.material.update({ where: { id: material.id }, data: { isActive: active } });
      await syncMaterialCatalog(tx, material.id);
    });
    revalidateMaterials();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a situação do material." };
  }
}

export async function deleteMaterialAction(id: string): Promise<MaterialActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "delete");
    const material = await context.prisma.material.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            stocks: true,
            movements: true,
            requests: true,
            purchaseRequestItems: true,
            purchaseProcessItems: true,
            receiptItems: true,
            obrasServiceMaterials: true,
          },
        },
      },
    });
    if (!material) throw new Error("Material não encontrado.");
    const linkedRecords = Object.values(material._count).reduce((total, value) => total + value, 0);
    if (linkedRecords > 0) throw new Error("Este material possui estoque, movimentações ou documentos vinculados. Inative-o em vez de excluir.");
    await context.prisma.material.delete({ where: { id: material.id } });
    revalidateMaterials();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível excluir o material." };
  }
}
