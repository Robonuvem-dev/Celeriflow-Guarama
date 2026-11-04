import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { departments } from "@/db/schema/administration";
import { auditEvents } from "@/db/schema/audit";
import { documentVersions } from "@/db/schema/document-workflow";
import { catalogItems } from "@/db/schema/master-data";
import { planningObjectives } from "@/db/schema/planning-legal";
import {
  purchaseDemandEvents,
  purchaseDemandVersions,
  purchasePlanningAiSuggestionLogs,
  purchasePlanningDocumentVersions,
  purchasePlannings,
  purchaseRequests,
} from "@/db/schema/procurement-requests";
import {
  type AiSuggestionDecision,
  type AiSuggestionType,
  type EtpDocumentPayload,
  type InternalPhaseDocumentStatus,
  type InternalPhaseDocumentType,
  type PcaDocumentPayload,
  type PlanningUpstreamContext,
  type TrDocumentPayload,
  InternalPhaseDocumentError,
  normalizeEtpPayload,
  normalizePcaPayload,
  normalizeTrPayload,
  verifyInternalPhaseCoherence,
} from "@/lib/compras/internal-phase-documents";
import type { InternalPhaseMonitoringItem } from "@/lib/compras/pca-consolidation";

export const internalPhaseStatusLabel: Record<InternalPhaseDocumentStatus, string> = {
  RASCUNHO: "Rascunho em elaboração",
  EM_ANALISE: "Em análise / revisão",
  DEVOLVIDO: "Devolvido para ajustes",
  APROVADO: "Aprovado",
};

export async function listInternalPhaseDocumentVersions(
  db: DatabaseExecutor,
  planningId: string,
  documentType?: InternalPhaseDocumentType,
) {
  const condition = documentType
    ? and(
        eq(purchasePlanningDocumentVersions.purchasePlanningId, planningId),
        eq(purchasePlanningDocumentVersions.documentType, documentType),
      )
    : eq(purchasePlanningDocumentVersions.purchasePlanningId, planningId);

  return db
    .select()
    .from(purchasePlanningDocumentVersions)
    .where(condition)
    .orderBy(
      asc(purchasePlanningDocumentVersions.documentType),
      desc(purchasePlanningDocumentVersions.version),
    );
}

export async function listAiSuggestionLogsForPlanning(
  db: DatabaseExecutor,
  planningId: string,
) {
  return db
    .select()
    .from(purchasePlanningAiSuggestionLogs)
    .where(eq(purchasePlanningAiSuggestionLogs.purchasePlanningId, planningId))
    .orderBy(desc(purchasePlanningAiSuggestionLogs.createdAt));
}

export async function buildPlanningUpstreamContext(
  db: DatabaseExecutor,
  planningId: string,
): Promise<PlanningUpstreamContext | null> {
  const [row] = await db
    .select({
      planning: purchasePlannings,
      catalogName: catalogItems.name,
      objectiveCode: planningObjectives.code,
      objectiveDescription: planningObjectives.description,
      request: {
        id: purchaseRequests.id,
        number: purchaseRequests.number,
        object: purchaseRequests.object,
        justification: purchaseRequests.justification,
        status: purchaseRequests.status,
      },
    })
    .from(purchasePlannings)
    .leftJoin(catalogItems, eq(catalogItems.id, purchasePlannings.catalogItemId))
    .leftJoin(planningObjectives, eq(planningObjectives.id, purchasePlannings.objectiveId))
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, purchasePlannings.originPurchaseRequestId))
    .where(eq(purchasePlannings.id, planningId));

  if (!row) return null;

  const latestDfdRows = row.request?.id
    ? await db
        .select()
        .from(purchaseDemandVersions)
        .where(eq(purchaseDemandVersions.purchaseRequestId, row.request.id))
        .orderBy(desc(purchaseDemandVersions.version))
        .limit(1)
    : [];
  const latestDfd = latestDfdRows[0] ?? null;

  const latestEtpRows = await db
    .select()
    .from(purchasePlanningDocumentVersions)
    .where(
      and(
        eq(purchasePlanningDocumentVersions.purchasePlanningId, planningId),
        eq(purchasePlanningDocumentVersions.documentType, "ETP"),
      ),
    )
    .orderBy(desc(purchasePlanningDocumentVersions.version))
    .limit(1);
  const latestEtp = latestEtpRows[0] ?? null;

  const itemName = row.catalogName ?? row.planning.description ?? "Item sem especificação";

  return {
    planningId: row.planning.id,
    itemName,
    description: row.planning.description,
    unit: row.planning.unit,
    quantity: row.planning.quantity,
    expectedPeriodStartIso: row.planning.expectedPeriodStart.toISOString().slice(0, 10),
    expectedPeriodEndIso: row.planning.expectedPeriodEnd.toISOString().slice(0, 10),
    estimatedValueDecimal: String(row.planning.estimatedValueDecimal),
    status: row.planning.status,
    objectiveCodeAndDescription:
      row.objectiveCode && row.objectiveDescription
        ? `${row.objectiveCode} · ${row.objectiveDescription}`
        : null,
    originRequest: row.request?.id ? row.request : null,
    latestDfdVersion: latestDfd
      ? {
          id: latestDfd.id,
          version: latestDfd.version,
          object: latestDfd.snapshot.object,
          justification: latestDfd.snapshot.justification,
          secretariat: latestDfd.snapshot.secretariat,
          department: latestDfd.snapshot.department,
          estimatedValue: latestDfd.snapshot.estimatedValue,
        }
      : null,
    latestEtpVersion: latestEtp
      ? {
          id: latestEtp.id,
          version: latestEtp.version,
          status: latestEtp.status,
          payload: latestEtp.payload as unknown as EtpDocumentPayload,
        }
      : null,
  };
}

export async function recordInternalPhaseDocumentVersion(
  db: DatabaseExecutor,
  params: {
    planningId: string;
    documentType: InternalPhaseDocumentType;
    expectedVersion: number;
    actorId: string;
    rawPayload: Record<string, unknown>;
    gedDocumentVersionId?: string | null;
    now?: Date;
  },
) {
  const ctx = await buildPlanningUpstreamContext(db, params.planningId);
  if (!ctx) {
    throw new InternalPhaseDocumentError("Planejamento de compra não encontrado.");
  }

  const existingVersions = await listInternalPhaseDocumentVersions(db, params.planningId, params.documentType);
  const latest = existingVersions[0];
  if ((latest?.version ?? 0) !== params.expectedVersion) {
    throw new InternalPhaseDocumentError(
      `O documento ${params.documentType} foi atualizado por outro usuário. Recarregue a página antes de salvar nova versão.`,
    );
  }

  let normalizedPayload: PcaDocumentPayload | EtpDocumentPayload | TrDocumentPayload;
  if (params.documentType === "PCA") {
    normalizedPayload = normalizePcaPayload(params.rawPayload);
  } else if (params.documentType === "ETP") {
    normalizedPayload = normalizeEtpPayload(params.rawPayload);
  } else {
    normalizedPayload = normalizeTrPayload(params.rawPayload);
  }

  const sourceDfdVersionId = ctx.latestDfdVersion?.id ?? null;
  const sourceEtpVersionId = params.documentType === "TR" ? (ctx.latestEtpVersion?.id ?? null) : null;

  const coherenceReport = verifyInternalPhaseCoherence({
    ctx,
    documentType: params.documentType,
    payload: normalizedPayload,
    sourceDfdVersionId,
    sourceEtpVersionId,
    now: params.now,
  });

  const nextVersion = params.expectedVersion + 1;
  const [inserted] = await db
    .insert(purchasePlanningDocumentVersions)
    .values({
      purchasePlanningId: params.planningId,
      documentType: params.documentType,
      version: nextVersion,
      status: "RASCUNHO",
      sourceDfdVersionId,
      sourceEtpVersionId,
      gedDocumentVersionId: params.gedDocumentVersionId ?? latest?.gedDocumentVersionId ?? null,
      payload: normalizedPayload as unknown as Record<string, unknown>,
      coherenceReport,
      actorId: params.actorId,
    })
    .returning();

  return inserted;
}

export async function transitionInternalPhaseDocumentStatus(
  db: DatabaseExecutor,
  params: {
    versionId: string;
    actorId: string;
    targetStatus: "EM_ANALISE" | "DEVOLVIDO" | "APROVADO";
    reason: string;
    gedDocumentVersionId?: string | null;
  },
) {
  const trimmedReason = params.reason.trim();
  if (!trimmedReason || trimmedReason.length > 2000) {
    throw new InternalPhaseDocumentError("Informe um despacho/justificativa de até 2.000 caracteres para a tramitação.");
  }

  const [current] = await db
    .select()
    .from(purchasePlanningDocumentVersions)
    .where(eq(purchasePlanningDocumentVersions.id, params.versionId));

  if (!current) {
    throw new InternalPhaseDocumentError("Versão do documento da fase interna não encontrada.");
  }

  if (params.targetStatus === "EM_ANALISE") {
    if (current.status !== "RASCUNHO" && current.status !== "DEVOLVIDO") {
      throw new InternalPhaseDocumentError("Somente versões em rascunho ou devolvidas podem ser encaminhadas para análise.");
    }
    const finalGedId = params.gedDocumentVersionId ?? current.gedDocumentVersionId;
    const [updated] = await db
      .update(purchasePlanningDocumentVersions)
      .set({
        status: "EM_ANALISE",
        actorId: params.actorId,
        reviewReason: trimmedReason,
        gedDocumentVersionId: finalGedId ?? null,
      })
      .where(eq(purchasePlanningDocumentVersions.id, current.id))
      .returning();
    return updated;
  }

  if (current.status !== "EM_ANALISE") {
    throw new InternalPhaseDocumentError("Somente documentos 'Em análise' podem ser aprovados ou devolvidos.");
  }
  if (current.actorId === params.actorId) {
    throw new InternalPhaseDocumentError("Segregação de funções: a decisão de aprovação ou devolução deve ser registrada por outro usuário.");
  }

  if (params.targetStatus === "APROVADO" && current.documentType === "TR") {
    const ctx = await buildPlanningUpstreamContext(db, current.purchasePlanningId);
    if (ctx?.latestEtpVersion?.payload.viabilityConclusion === "INVIAVEL") {
      throw new InternalPhaseDocumentError("Não é permitido aprovar o Termo de Referência quando o ETP vinculado concluiu pela inviabilidade.");
    }
  }

  const [updated] = await db
    .update(purchasePlanningDocumentVersions)
    .set({
      status: params.targetStatus,
      reviewerId: params.actorId,
      reviewReason: trimmedReason,
      gedDocumentVersionId: params.gedDocumentVersionId ?? current.gedDocumentVersionId,
    })
    .where(eq(purchasePlanningDocumentVersions.id, current.id))
    .returning();

  return updated;
}

export async function recordAiSuggestionDecision(
  db: DatabaseExecutor,
  params: {
    planningId: string;
    documentType: "DFD" | "PCA" | "ETP" | "TR";
    fieldKey: string;
    suggestionType: AiSuggestionType;
    suggestedText: string;
    decision: AiSuggestionDecision;
    finalText: string;
    justification?: string | null;
    actorId: string;
  },
) {
  const suggestedText = params.suggestedText.trim();
  const finalText = params.finalText.trim();
  if (!suggestedText) {
    throw new InternalPhaseDocumentError("O texto sugerido pelo assistente não pode ser vazio.");
  }
  if (params.decision !== "RECUSADA" && !finalText) {
    throw new InternalPhaseDocumentError("Informe o texto final validado pelo usuário ao aceitar ou editar a sugestão.");
  }
  if (params.decision === "EDITADA" && finalText === suggestedText) {
    throw new InternalPhaseDocumentError("Para registrar decisão 'EDITADA', altere o texto sugerido antes de confirmar.");
  }

  const [logged] = await db
    .insert(purchasePlanningAiSuggestionLogs)
    .values({
      purchasePlanningId: params.planningId,
      documentType: params.documentType,
      fieldKey: params.fieldKey.trim(),
      suggestionType: params.suggestionType,
      suggestedText,
      decision: params.decision,
      finalText: params.decision === "RECUSADA" ? (finalText || "[Sugestão recusada pelo responsável]") : finalText,
      justification: params.justification?.trim() || null,
      actorId: params.actorId,
    })
    .returning();

  return logged;
}

export async function listPlanningAuditTrail(
  db: DatabaseExecutor,
  planningId: string,
  originRequestId?: string | null,
) {
  const targetIds = [planningId, ...(originRequestId ? [originRequestId] : [])];
  return db
    .select()
    .from(auditEvents)
    .where(inArray(auditEvents.targetId, targetIds))
    .orderBy(desc(auditEvents.createdAt))
    .limit(40);
}

export async function loadLinkedGedVersionMap(
  db: DatabaseExecutor,
  gedVersionIds: string[],
) {
  const uniqueIds = [...new Set(gedVersionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, { id: string; documentId: string; versionNumber: number; status: string }>();
  const rows = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      versionNumber: documentVersions.versionNumber,
      status: documentVersions.status,
    })
    .from(documentVersions)
    .where(inArray(documentVersions.id, uniqueIds));
  return new Map(rows.map(row => [row.id, row]));
}

export async function listInternalPhaseMonitoringItems(
  db: DatabaseExecutor,
  year?: number,
): Promise<InternalPhaseMonitoringItem[]> {
  const plannings = await db
    .select({
      id: purchasePlannings.id,
      description: purchasePlannings.description,
      catalogName: catalogItems.name,
      status: purchasePlannings.status,
      expectedPeriodStart: purchasePlannings.expectedPeriodStart,
      expectedPeriodEnd: purchasePlannings.expectedPeriodEnd,
      estimatedValueDecimal: purchasePlannings.estimatedValueDecimal,
      originPurchaseRequestId: purchasePlannings.originPurchaseRequestId,
      unitName: departments.name,
    })
    .from(purchasePlannings)
    .leftJoin(catalogItems, eq(catalogItems.id, purchasePlannings.catalogItemId))
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, purchasePlannings.originPurchaseRequestId))
    .leftJoin(departments, eq(departments.id, purchaseRequests.departmentId))
    .orderBy(asc(purchasePlannings.expectedPeriodStart));

  const filtered = year
    ? plannings.filter(p => p.expectedPeriodStart.getUTCFullYear() === year)
    : plannings;

  if (filtered.length === 0) return [];

  const planningIds = filtered.map(p => p.id);
  const requestIds = [...new Set(filtered.map(p => p.originPurchaseRequestId).filter((id): id is string => Boolean(id)))];

  const [docVersions, dfdVersions] = await Promise.all([
    db
      .select()
      .from(purchasePlanningDocumentVersions)
      .where(inArray(purchasePlanningDocumentVersions.purchasePlanningId, planningIds))
      .orderBy(desc(purchasePlanningDocumentVersions.version)),
    requestIds.length > 0
      ? db
          .select()
          .from(purchaseDemandVersions)
          .where(inArray(purchaseDemandVersions.purchaseRequestId, requestIds))
          .orderBy(desc(purchaseDemandVersions.version))
      : Promise.resolve([]),
  ]);

  const dfdVersionIds = dfdVersions.map(v => v.id);
  const dfdEvents = dfdVersionIds.length > 0
    ? await db
        .select()
        .from(purchaseDemandEvents)
        .where(inArray(purchaseDemandEvents.demandVersionId, dfdVersionIds))
        .orderBy(desc(purchaseDemandEvents.step))
    : [];

  const latestDfdByRequest = new Map<string, typeof dfdVersions[number]>();
  for (const v of dfdVersions) {
    if (!latestDfdByRequest.has(v.purchaseRequestId)) {
      latestDfdByRequest.set(v.purchaseRequestId, v);
    }
  }

  const latestEventByDfd = new Map<string, typeof dfdEvents[number]>();
  for (const ev of dfdEvents) {
    if (!latestEventByDfd.has(ev.demandVersionId)) {
      latestEventByDfd.set(ev.demandVersionId, ev);
    }
  }

  const latestDocByPlanningAndType = new Map<string, typeof docVersions[number]>();
  for (const doc of docVersions) {
    const key = `${doc.purchasePlanningId}:${doc.documentType}`;
    if (!latestDocByPlanningAndType.has(key)) {
      latestDocByPlanningAndType.set(key, doc);
    }
  }

  return filtered.map(p => {
    const dfd = p.originPurchaseRequestId ? latestDfdByRequest.get(p.originPurchaseRequestId) : undefined;
    const dfdEvent = dfd ? latestEventByDfd.get(dfd.id) : undefined;
    const pcaDoc = latestDocByPlanningAndType.get(`${p.id}:PCA`);
    const etpDoc = latestDocByPlanningAndType.get(`${p.id}:ETP`);
    const trDoc = latestDocByPlanningAndType.get(`${p.id}:TR`);

    const gedLinkedCount = [
      dfdEvent?.documentVersionId,
      pcaDoc?.gedDocumentVersionId,
      etpDoc?.gedDocumentVersionId,
      trDoc?.gedDocumentVersionId,
    ].filter(Boolean).length;

    const coherent = [pcaDoc, etpDoc, trDoc]
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .every(d => d.coherenceReport?.coherent !== false);

    return {
      planningId: p.id,
      description: p.catalogName ?? p.description ?? "Item sem especificação",
      unitName: p.unitName ?? "Sem unidade identificada",
      status: p.status,
      expectedPeriodStart: p.expectedPeriodStart,
      expectedPeriodEnd: p.expectedPeriodEnd,
      estimatedValue: String(p.estimatedValueDecimal),
      hasDfd: Boolean(dfd),
      dfdApproved: dfdEvent?.status === "APROVADO",
      pcaStatus: pcaDoc?.status ?? null,
      etpStatus: etpDoc?.status ?? null,
      trStatus: trDoc?.status ?? null,
      gedLinkedCount,
      coherent,
    };
  });
}

