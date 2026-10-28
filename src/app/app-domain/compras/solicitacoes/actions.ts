"use server";

import { getTenantContextForModuleOperation, isSystemAdministrator, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { nextYearlyCodeDrizzle } from "@/db/repositories/platform/sequences";
import { loadPurchaseRequestsWithAllocations } from "@/db/repositories/procurement/lifecycle";
import { listRequestAppropriations, loadRequestCatalogItems } from "@/db/repositories/procurement/purchase-requests";
import { departments, employees, secretariats } from "@/db/schema/administration";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations } from "@/db/schema/procurement-requests";
import { approvePurchaseRequest as approveOfficialPurchaseRequest, ProcurementLifecycleError } from "@/lib/compras/procurement-lifecycle";
import { assertPurchaseRequestOrigin, canManagePurchaseRequest, PurchaseRequestOriginError } from "@/lib/compras/purchase-request-policy";
import { normalizePurchaseRequestItemBudgetAllocations, PurchaseRequestBudgetError, totalPurchaseRequestBudgetAllocations } from "@/lib/compras/purchase-request-budget";
import { normalizePurchaseItems, PurchaseItemInputError } from "../processos/purchase-item-input";

async function getTenantContext(operation: ModuleOperation) {
  return getTenantContextForModuleOperation("COMPRAS", operation);
}

type PurchaseRequestItemInput = {
  id?: string;
  catalogItemId: string;
  customName: string;
  quantity: number;
  estimatedUnitValue: number;
  allocations: Array<{
    budgetAppropriationId: string;
    quantity: number;
    value: number;
  }>;
};

type PurchaseRequestInput = {
  id?: string;
  number: string;
  object: string;
  justification: string;
  priority?: string;
  estimatedValue: number;
  items: PurchaseRequestItemInput[];
  secretariatId: string;
  departmentId: string;
};

const purchaseRequestPriorities = new Set(["Baixa", "Normal", "Alta", "Urgente"]);

export async function deletePurchaseRequest(id: string) {
  try {
    const context = await getTenantContext("delete");
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [existing] = await loadPurchaseRequestsWithAllocations(tx, [id]);
      if (!existing || !canManagePurchaseRequest(context.user, existing)) {
        return { error: "Somente o solicitante pode excluir uma solicitacao em rascunho." };
      }
      if (existing.items.length) {
        await tx.delete(purchaseRequestBudgetAllocations).where(inArray(purchaseRequestBudgetAllocations.purchaseRequestItemId, existing.items.map(item => item.id)));
      }
      await tx.delete(purchaseRequests).where(eq(purchaseRequests.id, id));
      return { success: true };
    });
    if ("error" in result) return { success: false, error: result.error };
    revalidatePath("/compras/solicitacoes");
    return { success: true };
  } catch (error) {
    console.error("Error deleting purchase request:", error);
    return { success: false, error: "Falha ao excluir a solicitação." };
  }
}

export async function savePurchaseRequest(payload: PurchaseRequestInput) {
  try {
    const { id, number, object, justification, priority = "Normal", items, secretariatId, departmentId } = payload;
    if (!purchaseRequestPriorities.has(priority)) {
      return { success: false, error: "Prioridade de planejamento invalida." };
    }
    const normalizedItems = normalizePurchaseItems(items);
    const allocationsByItem = normalizedItems.items.map((item, index) => normalizePurchaseRequestItemBudgetAllocations(items[index]?.allocations, item));
    const estimatedValue = totalPurchaseRequestBudgetAllocations(allocationsByItem).toNumber();
    const context = await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");
    if (!secretariatId?.trim() || !departmentId?.trim()) return { success: false, error: "Selecione a secretaria e o departamento solicitante." };
    if (!context.user.employeeId && !id) return { success: false, error: "O usuário autenticado deve estar vinculado a um servidor solicitante para criar a solicitação." };
    assertPurchaseRequestOrigin(context.user, { secretariatId, departmentId });
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [existing] = id ? await loadPurchaseRequestsWithAllocations(tx, [id]) : [];
      if (id && (!existing || !canManagePurchaseRequest(context.user, existing))) {
        return { error: "Somente o solicitante pode editar uma solicitação em rascunho." };
      }

      const requesterId = existing?.requesterId ?? context.user.employeeId;
      if (!requesterId) return { error: "A solicitacao precisa manter um servidor solicitante ativo." };

      const catalogItemIds = normalizedItems.items.flatMap((item) => item.catalogItemId ? [item.catalogItemId] : []);
      const budgetAppropriationIds = [...new Set(allocationsByItem.flatMap((allocations) => allocations.map((allocation) => allocation.budgetAppropriationId)))];
      const [[secretariat], [department], [requester], catalogItems, budgetAppropriations] = await Promise.all([
        tx.select().from(secretariats).where(eq(secretariats.id, secretariatId)).limit(1),
        tx.select().from(departments).where(eq(departments.id, departmentId)).limit(1),
        tx.select({ id: employees.id, isActive: employees.isActive }).from(employees).where(eq(employees.id, requesterId)).limit(1),
        loadRequestCatalogItems(tx, catalogItemIds),
        listRequestAppropriations(tx, { ids: budgetAppropriationIds, secretariatId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }),
      ]);
      if (!secretariat || !department || department.secretariatId !== secretariat.id || !requester?.isActive) {
        return { error: "Secretaria, departamento ou solicitante inválido." };
      }
      if (catalogItems.length !== new Set(catalogItemIds).size) {
        return { error: "Selecione itens ativos do catálogo ou descreva o item livre." };
      }
      if (catalogItems.some((item) => item.materials.length > 1)) {
        return { error: "Um item do catálogo está vinculado a mais de um material. Corrija o cadastro antes de criar a solicitação." };
      }
      if (catalogItems.some((item) => item.materials.some((material) => !material.isActive))) {
        return { error: "Um item do catálogo está vinculado a material inativo. Selecione outro item ou reative o material." };
      }
      if (budgetAppropriations.length !== budgetAppropriationIds.length) {
        return { error: "Selecione dotações orçamentárias existentes, acessíveis e vinculadas à secretaria da solicitação." };
      }

      let finalNumber = number?.trim();
      if (!finalNumber && !id) {
        const requests = await tx.select({ number: purchaseRequests.number }).from(purchaseRequests);
        finalNumber = await nextYearlyCodeDrizzle({ db: tx, key: "compras-solicitacao", prefix: "REQ", existingCodes: requests.map(({ number }) => ({ code: number })) });
      }
      if (!finalNumber) return { error: "Informe o número da solicitação." };

      const materialIdByCatalogItemId = new Map(catalogItems.map((item) => [item.id, item.materials[0]?.id ?? null]));
      const existingItemsById = new Map((existing?.items ?? []).map((item) => [item.id, item]));
      const suppliedItemIds = new Set<string>();
      for (const item of normalizedItems.items) {
        if (!item.id) continue;
        if (suppliedItemIds.has(item.id) || !existingItemsById.has(item.id)) {
          return { error: "Os itens informados não pertencem a esta solicitação." };
        }
        suppliedItemIds.add(item.id);
      }
      const requestData = {
        number: finalNumber,
        object,
        justification,
        priority,
        estimatedValue,
        secretariatId: secretariat.id,
        departmentId: department.id,
        requesterId: requester.id,
      };
      const [request] = id
        ? await tx.update(purchaseRequests).set(requestData).where(eq(purchaseRequests.id, id)).returning()
        : await tx.insert(purchaseRequests).values(requestData).returning();
      const removedItems = (existing?.items ?? []).filter((item) => !suppliedItemIds.has(item.id));
      if (removedItems.length) {
        await tx.delete(purchaseRequestBudgetAllocations).where(inArray(purchaseRequestBudgetAllocations.purchaseRequestItemId, removedItems.map(item => item.id)));
        await tx.delete(purchaseRequestItems).where(inArray(purchaseRequestItems.id, removedItems.map(item => item.id)));
      }

      for (const [index, item] of normalizedItems.items.entries()) {
        const itemData = {
          purchaseRequestId: request.id,
          catalogItemId: item.catalogItemId,
          materialId: item.catalogItemId ? materialIdByCatalogItemId.get(item.catalogItemId) ?? null : null,
          customName: item.customName,
          quantity: item.quantity,
          estimatedUnitValue: item.estimatedUnitValue,
        };
        const allocations = allocationsByItem[index].map((allocation) => ({
          budgetAppropriationId: allocation.budgetAppropriationId,
          quantity: allocation.quantity,
          valueDecimal: allocation.valueDecimal,
        }));
        if (item.id) {
          await tx.update(purchaseRequestItems).set(itemData).where(eq(purchaseRequestItems.id, item.id));
          await tx.delete(purchaseRequestBudgetAllocations).where(eq(purchaseRequestBudgetAllocations.purchaseRequestItemId, item.id));
          if (allocations.length) await tx.insert(purchaseRequestBudgetAllocations).values(allocations.map(allocation => ({ purchaseRequestItemId: item.id!, ...allocation })));
        } else {
          const [created] = await tx.insert(purchaseRequestItems).values(itemData).returning({ id: purchaseRequestItems.id });
          if (allocations.length) await tx.insert(purchaseRequestBudgetAllocations).values(allocations.map(allocation => ({ purchaseRequestItemId: created.id, ...allocation })));
        }
      }
      return { id: request.id };
    }, { isolationLevel: "serializable" });

    if ("error" in result) return { success: false, error: result.error };

    revalidatePath("/compras/solicitacoes");
    revalidatePath(`/compras/solicitacoes/${result.id}`);
    return { success: true };
  } catch (error) {
    if (error instanceof PurchaseRequestOriginError) return { success: false, error: error.message };
    if (error instanceof PurchaseItemInputError) return { success: false, error: error.message };
    if (error instanceof PurchaseRequestBudgetError) return { success: false, error: error.message };
    console.error("Error saving purchase request:", error);
    return { success: false, error: "Falha ao salvar a solicitação." };
  }
}

export async function approvePurchaseRequest(id: string) {
  try {
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");
    await approveOfficialPurchaseRequest(databaseConnection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath("/compras/solicitacoes");
    revalidatePath(`/compras/solicitacoes/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof ProcurementLifecycleError ? error.message : "Falha ao aprovar a solicitação." };
  }
}
