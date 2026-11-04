"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { listDemandVersions, loadDemandDraft, recordDemandVersion } from "@/db/repositories/procurement/purchase-demand";
import { advanceDemandWorkflow } from "@/db/repositories/procurement/purchase-demand-workflow";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import { withDatabaseTransaction } from "@/db/transaction";
import { assertPurchaseRequestOrigin } from "@/lib/compras/purchase-request-policy";
import { auditEventTypes } from "@/lib/contracts/audit";
import { getGedContext } from "@/lib/documents/ged-access";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

export async function formalizeDemand(id: string, expectedVersion: number): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("COMPRAS", "update");
  const version = await withDatabaseTransaction(databaseConnection, async tx => {
    const [source] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update");
    if (!source?.approvedAt || source.status === "Rascunho") {
      throw new Error("A solicitação precisa estar aprovada para formalizar o DFD.");
    }
    assertPurchaseRequestOrigin(user, source);
    const draft = await loadDemandDraft(tx, id);
    if (!draft) throw new Error("Solicitação indisponível.");
    const recordedVersion = await recordDemandVersion(tx, id, user.id, expectedVersion, draft.snapshot);
    await insertAuditEvent(tx, {
      actorUsuarioId: user.id,
      eventType: auditEventTypes.administrativeMutation,
      targetType: "PurchaseDemandVersion:DFD",
      targetId: id,
    });
    return recordedVersion;
  });
  redirect(`/compras/solicitacoes/${id}/dfd?versao=${version}`);
}

export async function routeDemand(id: string, version: number, expectedStep: number, form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  const status = form.get("status");
  if (status !== "EM_ANALISE" && status !== "DEVOLVIDO" && status !== "APROVADO") {
    throw new Error("Ação de tramitação inválida.");
  }
  const reason = String(form.get("reason") ?? "");
  const ged = status === "EM_ANALISE" ? await getGedContext() : null;
  await withDatabaseTransaction(databaseConnection, async tx => {
    const [source] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update");
    if (!source?.approvedAt || source.status === "Rascunho") throw new Error("Solicitação indisponível.");
    assertPurchaseRequestOrigin(context.user, source);
    const [current] = await listDemandVersions(tx, id);
    if (!current || current.version !== version) throw new Error("Somente a versão atual pode tramitar.");
    let documentVersionId: string | null = null;
    if (ged) {
      const [documentId, expectedDocumentVersion] = String(form.get("document") ?? "").split(":");
      if (!documentId || documentId.length > 100 || !expectedDocumentVersion) throw new Error("Selecione um documento do GED.");
      const document = await requireManagedDocument(ged, documentId, tx);
      if (document.versionId !== expectedDocumentVersion || !["FINAL", "SIGNED"].includes(document.versionStatus) || document.checkoutOwnerId) {
        throw new Error("A versão final do GED mudou ou está reservada para edição.");
      }
      documentVersionId = document.versionId;
    }
    await advanceDemandWorkflow(tx, current.id, context.user.id, expectedStep, status, reason, documentVersionId);
    await insertAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: documentVersionId ? auditEventTypes.processDocumentLinked : auditEventTypes.processUpdated,
      targetType: "PurchaseDemandWorkflow:DFD",
      targetId: id,
    });
  });
  redirect(`/compras/solicitacoes/${id}/dfd?versao=${version}`);
}
