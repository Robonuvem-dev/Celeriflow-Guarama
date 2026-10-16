import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess, assertNoPendingItbiAdjustments } from "./itbi-process-channel";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { attributeItbiHistory } from "./itbi-history";

export async function decideItbiFiscalTreatment(db: PrismaClient, actor: TaxActor, raw: {
  declarationId: string; expectedUpdatedAt: string; treatment: "ISENTO" | "IMUNIDADE" | "NAO_INCIDENCIA" | "TRIBUTAVEL";
  legalBasis: string; reason: string; documentIds: string[];
}) {
  const input = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), treatment: z.enum(["ISENTO", "IMUNIDADE", "NAO_INCIDENCIA", "TRIBUTAVEL"]), legalBasis: z.string().trim().min(1).max(4000), reason: z.string().trim().min(1).max(8000), documentIds: z.array(z.string().min(1)).min(1).max(50) }).parse(raw);
  return db.$transaction(async tx => {
    await attributeItbiHistory(tx, actor);
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const { declaration, scope } = await assertInternalItbiProcessAccess(tx, actor, input.declarationId);
    if (declaration.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Declaração alterada. Recarregue antes da decisão.");
    if (declaration.assessmentId || declaration.guideId || declaration.cadastralUpdatedAt || !["PROTOCOLADA", "EM_ANALISE", "NAO_TRIBUTAVEL"].includes(declaration.status)) throw new Error("Decisão exige processo em análise e sem crédito constituído ou transferência cadastral.");
    await assertNoPendingItbiAdjustments(tx, declaration.id);
    const links = declaration.processId ? await tx.processDocument.findMany({ where: { processId: declaration.processId, documentId: { in: input.documentIds } }, select: { documentId: true } }) : [];
    if (input.documentIds.some(id => !links.some(link => link.documentId === id))) throw new Error("A decisão deve usar documentos comprobatórios vinculados a este processo.");
    await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_FISCAL_TREATMENT" }, orderBy: { version: "desc" } });
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_FISCAL_TREATMENT", title: input.treatment, version: (previous?.version ?? 0) + 1, actorUsuarioId: actor.usuarioId, processId: declaration.processId, data: { ...scope, ...input, previousId: previous?.id ?? null, theoreticalTax: declaration.taxAmount.toFixed(2), payableTax: input.treatment === "TRIBUTAVEL" ? declaration.taxAmount.toFixed(2) : "0.00" } } });
    if (declaration.documentId) await tx.document.update({ where: { id: declaration.documentId }, data: { status: "Revogado" } });
    let documentId: string | null = null;
    if (input.treatment !== "TRIBUTAVEL") {
      const document = await tx.document.create({ data: { title: `${input.treatment} — ITBI ${declaration.declarationNumber}`, documentType: "Decisão fiscal ITBI", fileUrl: `/api/tributacao/itbi/${declaration.id}/pdf`, publicLabel: "Decisão municipal de ITBI", status: "Válido", notes: input.legalBasis } });
      documentId = document.id;
      if (declaration.processId) await tx.processDocument.create({ data: { processId: declaration.processId, documentId, purpose: "Decisão de tratamento fiscal do ITBI", employeeId: actor.employeeId } });
      await linkItbiPropertyAttachments(tx, actor, declaration.id, [documentId]);
    }
    await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: {
      status: input.treatment === "TRIBUTAVEL" ? "EM_ANALISE" : "NAO_TRIBUTAVEL", documentId, analysisNotes: input.reason, analyzedAt: new Date(),
      events: { create: { eventType: "TRATAMENTO_FISCAL_DECIDIDO", description: `${input.treatment}: ${input.reason}\nFundamento legal: ${input.legalBasis}`, actorUsuarioId: actor.usuarioId, payload: { decisionId: entry.id, documentId, documentIds: input.documentIds, previousStatus: declaration.status, previousDocumentId: declaration.documentId } } },
    } });
    await tx.taxAuditLog.create({ data: { action: "DECIDE_ITBI_FISCAL_TREATMENT", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, decisionId: entry.id, previousDecisionId: previous?.id ?? null, treatment: input.treatment, legalBasis: input.legalBasis, reason: input.reason, documentId } } });
    return { decisionId: entry.id, documentId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
