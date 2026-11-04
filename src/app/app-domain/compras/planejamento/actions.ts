"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import {
  recordAiSuggestionDecision,
  recordInternalPhaseDocumentVersion,
  transitionInternalPhaseDocumentStatus,
} from "@/db/repositories/procurement/internal-phase-documents";
import { catalogItems } from "@/db/schema/master-data";
import { planningObjectives } from "@/db/schema/planning-legal";
import { purchasePlannings, purchaseRequests } from "@/db/schema/procurement-requests";
import { withDatabaseTransaction } from "@/db/transaction";
import {
  type AiSuggestionDecision,
  type AiSuggestionType,
  type InternalPhaseDocumentType,
  aiSuggestionDecisions,
  aiSuggestionTypes,
  internalPhaseDocumentTypes,
} from "@/lib/compras/internal-phase-documents";
import {
  normalizePurchasePlanningInput,
  PurchasePlanningError,
} from "@/lib/compras/purchase-planning";
import { auditEventTypes } from "@/lib/contracts/audit";
import { getGedContext } from "@/lib/documents/ged-access";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

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
    const { user } = await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");
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
        if (user?.id) {
          await insertAuditEvent(tx, {
            actorUsuarioId: user.id,
            eventType: auditEventTypes.administrativeMutation,
            targetType: "PurchasePlanning",
            targetId: existing.id,
          });
        }
        return existing;
      }

      const [planning] = await tx.insert(purchasePlannings).values(data).returning({ id: purchasePlannings.id });
      if (user?.id) {
        await insertAuditEvent(tx, {
          actorUsuarioId: user.id,
          eventType: auditEventTypes.administrativeMutation,
          targetType: "PurchasePlanning",
          targetId: planning.id,
        });
      }
      return planning;
    });
    revalidatePlanningPaths(result.id);
    return { success: true, id: result.id };
  } catch (error) {
    return actionFailure(error);
  }
}

async function resolveOptionalGedVersionId(formData: FormData, tx: Parameters<typeof requireManagedDocument>[2]) {
  const rawDocument = formString(formData, "gedDocument");
  if (!rawDocument) return null;
  const [documentId, expectedVersionId] = rawDocument.split(":");
  if (!documentId || !expectedVersionId) {
    throw new Error("Seleção de documento do GED inválida.");
  }
  const ged = await getGedContext();
  const managed = await requireManagedDocument(ged, documentId, tx);
  if (
    managed.versionId !== expectedVersionId
    || !["FINAL", "SIGNED"].includes(managed.versionStatus)
    || managed.checkoutOwnerId
  ) {
    throw new Error("A versão selecionada no GED não é final/assinada ou está em edição.");
  }
  return managed.versionId;
}

export async function saveInternalPhaseDocumentAction(
  planningId: string,
  documentType: InternalPhaseDocumentType,
  expectedVersion: number,
  formData: FormData,
): Promise<void> {
  if (!internalPhaseDocumentTypes.includes(documentType)) {
    throw new Error("Tipo de documento da fase interna inválido.");
  }
  const { user } = await getTenantContextForModuleOperation("COMPRAS", "update");

  const rawPayload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$") && key !== "gedDocument") {
      rawPayload[key] = value;
    }
  }

  const inserted = await withDatabaseTransaction(databaseConnection, async tx => {
    const gedDocumentVersionId = await resolveOptionalGedVersionId(formData, tx);
    const created = await recordInternalPhaseDocumentVersion(tx, {
      planningId,
      documentType,
      expectedVersion,
      actorId: user.id,
      rawPayload,
      gedDocumentVersionId,
    });

    await insertAuditEvent(tx, {
      actorUsuarioId: user.id,
      eventType: auditEventTypes.administrativeMutation,
      targetType: `PurchasePlanningDocument:${documentType}`,
      targetId: planningId,
    });

    if (gedDocumentVersionId) {
      await insertAuditEvent(tx, {
        actorUsuarioId: user.id,
        eventType: auditEventTypes.processDocumentLinked,
        targetType: `PurchasePlanningDocument:${documentType}`,
        targetId: planningId,
      });
    }

    return created;
  });

  revalidatePlanningPaths(planningId);
  redirect(`/compras/planejamento/${planningId}?aba=${documentType.toLowerCase()}&versao=${inserted.version}`);
}

export async function routeInternalPhaseDocumentAction(
  planningId: string,
  versionId: string,
  documentType: InternalPhaseDocumentType,
  versionNumber: number,
  formData: FormData,
): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("COMPRAS", "update");
  const targetStatus = formString(formData, "status");
  if (targetStatus !== "EM_ANALISE" && targetStatus !== "DEVOLVIDO" && targetStatus !== "APROVADO") {
    throw new Error("Ação de tramitação inválida.");
  }
  const reason = formString(formData, "reason");

  await withDatabaseTransaction(databaseConnection, async tx => {
    const gedDocumentVersionId = await resolveOptionalGedVersionId(formData, tx);
    await transitionInternalPhaseDocumentStatus(tx, {
      versionId,
      actorId: user.id,
      targetStatus,
      reason,
      gedDocumentVersionId,
    });

    await insertAuditEvent(tx, {
      actorUsuarioId: user.id,
      eventType: auditEventTypes.processUpdated,
      targetType: `PurchasePlanningDocument:${documentType}`,
      targetId: planningId,
    });
  });

  revalidatePlanningPaths(planningId);
  redirect(`/compras/planejamento/${planningId}?aba=${documentType.toLowerCase()}&versao=${versionNumber}`);
}

export async function decideInternalPhaseAiSuggestionAction(
  planningId: string,
  documentType: InternalPhaseDocumentType,
  formData: FormData,
): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("COMPRAS", "update");
  const decision = formString(formData, "decision") as AiSuggestionDecision;
  const suggestionType = formString(formData, "suggestionType") as AiSuggestionType;
  if (!aiSuggestionDecisions.includes(decision)) {
    throw new Error("Decisão de validação humana inválida.");
  }
  if (!aiSuggestionTypes.includes(suggestionType)) {
    throw new Error("Tipo de sugestão assistiva inválido.");
  }
  const fieldKey = formString(formData, "fieldKey");
  const suggestedText = formString(formData, "suggestedText");
  const finalText = formString(formData, "finalText") || suggestedText;
  const justification = formString(formData, "justification");

  await withDatabaseTransaction(databaseConnection, async tx => {
    await recordAiSuggestionDecision(tx, {
      planningId,
      documentType,
      fieldKey,
      suggestionType,
      suggestedText,
      decision,
      finalText,
      justification,
      actorId: user.id,
    });

    await insertAuditEvent(tx, {
      actorUsuarioId: user.id,
      eventType: auditEventTypes.administrativeMutation,
      targetType: `PurchasePlanningAiSuggestion:${documentType}`,
      targetId: planningId,
    });
  });

  revalidatePlanningPaths(planningId);
  redirect(`/compras/planejamento/${planningId}?aba=${documentType.toLowerCase()}`);
}
