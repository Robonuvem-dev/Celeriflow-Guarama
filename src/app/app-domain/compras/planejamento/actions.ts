"use server";

import { and, eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { planningObjectives } from "@/db/schema/planning-legal";
import { catalogItems } from "@/db/schema/master-data";
import { purchasePlannings, purchaseRequests } from "@/db/schema/procurement-requests";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  normalizePurchasePlanningInput,
  PurchasePlanningError,
} from "@/lib/compras/purchase-planning";

export type PurchasePlanningActionResult = { success: true; id: string } | { success: false; error: string };

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function revalidatePlanningPaths(id: string) {
  revalidatePath("/compras/planejamento");
  revalidatePath("/compras/planejamento/pca");
  revalidatePath(`/compras/planejamento/${id}`);
  revalidatePath(`/compras/planejamento/${id}/editar`);
}

function actionFailure(error: unknown): PurchasePlanningActionResult {
  if (error instanceof PurchasePlanningError || error instanceof AccessError) {
    return { success: false, error: error.message };
  }
  if (["23503", "23001"].includes(getPostgresError(error)?.code ?? "")) {
    return { success: false, error: "O item, a solicitação de origem ou o objetivo não está mais disponível." };
  }
  console.error("Unable to save purchase planning:", error);
  return { success: false, error: "Não foi possível salvar o planejamento de compra." };
}

export async function savePurchasePlanning(formData: FormData): Promise<PurchasePlanningActionResult> {
  const id = formString(formData, "id");

  try {
    await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");
    const input = normalizePurchasePlanningInput({
      description: formString(formData, "description"),
      catalogItemId: formString(formData, "catalogItemId"),
      originPurchaseRequestId: formString(formData, "originPurchaseRequestId"),
      unit: formString(formData, "unit"),
      quantity: formString(formData, "quantity"),
      expectedPeriodStart: formString(formData, "expectedPeriodStart"),
      expectedPeriodEnd: formString(formData, "expectedPeriodEnd"),
      estimatedValueDecimal: formString(formData, "estimatedValueDecimal"),
      status: formString(formData, "status"),
    });

    const objectiveId = formData.has("objectiveId") ? formString(formData, "objectiveId") || null : undefined;
    const result = await withDatabaseTransaction(databaseConnection, async tx => {
    const [[catalogItem], [originPurchaseRequest]] = await Promise.all([
      input.catalogItemId
        ? tx.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.id, input.catalogItemId), eq(catalogItems.isActive, true))).limit(1)
        : [],
      input.originPurchaseRequestId
        ? tx.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.id, input.originPurchaseRequestId)).limit(1)
        : [],
    ]);

    if (input.catalogItemId && !catalogItem) {
      throw new PurchasePlanningError("Selecione um item ativo do catálogo.");
    }
    if (input.originPurchaseRequestId && !originPurchaseRequest) {
      throw new PurchasePlanningError("Selecione uma solicitação de origem existente.");
    }

    if (objectiveId) {
      const [objective] = await tx.select({ id: planningObjectives.id }).from(planningObjectives).where(eq(planningObjectives.id, objectiveId)).limit(1);
      if (!objective) throw new PurchasePlanningError("Selecione um objetivo existente do PPA.");
    }

    const data = {
      objectiveId,
      description: input.description,
      catalogItemId: input.catalogItemId,
      originPurchaseRequestId: input.originPurchaseRequestId,
      unit: input.unit,
      quantity: input.quantity,
      expectedPeriodStart: input.expectedPeriodStart,
      expectedPeriodEnd: input.expectedPeriodEnd,
      estimatedValueDecimal: input.estimatedValueDecimal,
      status: input.status,
    };

    if (id) {
      const [existing] = await tx.update(purchasePlannings).set(data).where(eq(purchasePlannings.id, id)).returning({ id: purchasePlannings.id });
      if (!existing) throw new PurchasePlanningError("Planejamento de compra não encontrado.");
      return existing;
    }

    const [planning] = await tx.insert(purchasePlannings).values(data).returning({ id: purchasePlannings.id });
    return planning;
    });
    revalidatePlanningPaths(result.id);
    return { success: true, id: result.id };
  } catch (error) {
    return actionFailure(error);
  }
}
