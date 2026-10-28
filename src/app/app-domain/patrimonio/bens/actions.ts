"use server";

import { acquireAssetFromPurchaseReceipt, AssetAcquisitionError, type AssetAcquisitionInput } from "@/lib/patrimonio/asset-acquisition-service";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assetOperationWhere, AssetOperationError } from "@/lib/patrimonio/asset-operations";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { and, eq, inArray, sql } from "drizzle-orm";
import { assets, assetCategories } from "@/db/schema/assets";
import { equipmentCustodies } from "@/db/schema/assets-stock";

type ActionResult = { error?: string; assetId?: string };

const assetEditInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do bem.").max(240),
  description: z.string().trim().max(4000).optional(),
  brand: z.string().trim().max(160).optional(),
  model: z.string().trim().max(160).optional(),
  serialNumber: z.string().trim().max(160).optional(),
  categoryId: z.string().trim().min(1, "Selecione a categoria patrimonial."),
});

type AssetEditInput = z.input<typeof assetEditInput>;

function revalidateAssetPages() {
  revalidatePath("/patrimonio/bens");
  revalidatePath("/patrimonio/ciclo-vida");
  revalidatePath("/patrimonio");
  revalidatePath("/patrimonio", "layout");
}

export async function acquireAssetFromReceiptAction(input: AssetAcquisitionInput): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "create");
    const asset = await acquireAssetFromPurchaseReceipt(databaseConnection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath("/patrimonio/bens");
    revalidatePath("/patrimonio");
    return { assetId: asset.id };
  } catch (error) {
    return { error: error instanceof AssetAcquisitionError ? error.message : "Não foi possível tombar o bem." };
  }
}

export async function updateAssetAction(assetId: string, input: AssetEditInput): Promise<ActionResult> {
  try {
    const parsed = assetEditInput.parse(input);
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const scope = assetOperationWhere(context);
    const [asset, category] = await Promise.all([
      db.select({ id: assets.id, status: assets.status }).from(assets).where(and(eq(assets.id, assetId), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1).then(rows => rows[0]),
      db.select({ id: assetCategories.id }).from(assetCategories).where(and(eq(assetCategories.id, parsed.categoryId), eq(assetCategories.isActive, true))).limit(1).then(rows => rows[0]),
    ]);
    if (!asset || asset.status === "Baixado") throw new AssetOperationError("Bem não encontrado, baixado ou fora do seu setor.");
    if (!category) throw new AssetOperationError("Categoria patrimonial não encontrada ou inativa.");

    await db.update(assets).set({
        name: parsed.name,
        description: parsed.description || null,
        brand: parsed.brand || null,
        model: parsed.model || null,
        serialNumber: parsed.serialNumber || null,
        categoryId: category.id,
    }).where(eq(assets.id, asset.id));
    revalidateAssetPages();
    return { assetId: asset.id };
  } catch (error) {
    return { error: error instanceof AssetOperationError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message || "Revise os dados do bem." : "Não foi possível atualizar o bem patrimonial." };
  }
}

export async function setAssetActiveAction(assetId: string, active: boolean): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const expectedStatuses = active ? ["Inativo"] : ["Ativo", "Em uso", "Ocioso"];
    const scope = assetOperationWhere(context);
    const updated = await db.update(assets).set({ status: active ? "Ativo" : "Inativo" }).where(and(
      eq(assets.id, assetId), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined, inArray(assets.status, expectedStatuses),
      !active ? sql`EXISTS (SELECT 1 FROM "FleetUnit" u WHERE u."assetId"=${assets.id} AND NOT EXISTS (SELECT 1 FROM "FleetWorkOrder" o WHERE o."unitId"=u.id AND o.status='EMITIDA'))` : undefined,
    )).returning({ id: assets.id });
    if (updated.length !== 1) {
      throw new AssetOperationError(active ? "O bem não está inativo, foi alterado por outra operação ou está fora do seu setor." : "O bem não pode ser inativado porque foi alterado, possui operação pendente de Frota ou não está em situação elegível.");
    }
    revalidateAssetPages();
    return { assetId };
  } catch (error) {
    return { error: error instanceof AssetOperationError ? error.message : "Não foi possível alterar a situação do bem." };
  }
}

export async function updateEquipmentCustodyAction(id: string, input: { name: string; serialNumber: string; status: string }): Promise<ActionResult> {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(240), serialNumber: z.string().trim().max(160), status: z.enum(["Em uso", "Ocioso", "Em manutenção"]) }).parse(input);
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const scope = assetOperationWhere(context);
    const [equipment] = await db.select({ id: equipmentCustodies.id }).from(equipmentCustodies).where(and(eq(equipmentCustodies.id, id), scope.departmentId ? eq(equipmentCustodies.departmentId, scope.departmentId) : undefined)).limit(1);
    if (!equipment) return { error: "Equipamento não encontrado no seu setor autorizado." };
    await db.update(equipmentCustodies).set({ ...parsed, serialNumber: parsed.serialNumber || null }).where(eq(equipmentCustodies.id, id));
    revalidateAssetPages();
    return {};
  } catch (error) {
    return { error: error instanceof z.ZodError ? "Revise os dados do equipamento." : "Não foi possível atualizar o equipamento." };
  }
}
