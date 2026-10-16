import "server-only";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, planningInstrumentWhere, type PlanningContext } from "./access";
import { requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";
import { canonicalPiece, finalizeLegalRevision, lockLegalInstrument, snapshotVersion } from "./operations-core";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { deleteUploadedDocument, uploadFile, validateUpload } from "@/lib/platform/blob";

const linkInput = z.object({ instrumentId: z.string().min(1), hearingId: z.string().min(1).optional(), documentId: z.string().min(1), purpose: z.enum(["ANNEX", "LEGAL_ACT", "HEARING_MINUTES"]) });
async function assertDocumentScope(tx: Prisma.TransactionClient, context: PlanningContext, entityId: string) {
  if (!isSystemAdministrator(context.user) && await tx.planningEntityUnit.count({ where: { governmentEntityId: entityId, budgetUnitId: { notIn: context.user.allowedBudgetUnitIds } } })) throw new AccessError("O documento contém o recorte integral da entidade; é necessário acesso a todas as unidades.", 403);
}

export async function linkPlanningDocument(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = linkInput.parse(raw);
  return context.prisma.$transaction((tx) => linkPlanningDocumentInTransaction(tx, context, input));
}

async function linkPlanningDocumentInTransaction(tx: Prisma.TransactionClient, context: PlanningContext, input: z.infer<typeof linkInput>) {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    await assertDocumentScope(tx, context, piece.governmentEntityId);
    const canonical = canonicalPiece(piece);
    if (input.purpose === "HEARING_MINUTES" && !input.hearingId) throw new Error("Selecione a audiência da ata.");
    if (input.purpose === "LEGAL_ACT" && ["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "") && canonical?.legalDocumentId && canonical.legalDocumentId !== input.documentId) throw new Error("O ato final de peça sancionada não pode ser substituído. Utilize revisão formal.");
    if (input.purpose === "LEGAL_ACT" && ["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) assertPlanningLegalAuthority(context);
    if (input.hearingId && !await tx.planningHearing.count({ where: { id: input.hearingId, instrumentId: piece.id } })) throw new AccessError("Audiência fora da peça autorizada.", 403);
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${input.documentId} FOR UPDATE`;
    const targetKey = `${input.purpose}:${input.hearingId ?? "instrument"}`;
    const preserved = await tx.planningDocumentLink.findUnique({ where: { instrumentId_documentId_targetKey: { instrumentId: piece.id, documentId: input.documentId, targetKey } } });
    if (preserved) return preserved.id;
    const document = await tx.document.findFirst({ where: { id: input.documentId, status: "Válido", documentType: { startsWith: "PLANEJAMENTO:" }, personId: null, companyId: null, healthClinicalDocument: { is: null }, sstCertificateDocument: { is: null }, healthLabReport: { is: null } }, include: { versions: { where: { status: { in: ["FINAL", "SIGNED"] } }, orderBy: { versionNumber: "desc" }, take: 1 } } });
    if (!document?.versions.length) throw new Error("Selecione um documento GED de Planejamento com versão final e hash. Documentos pessoais/clínicos não podem ser reutilizados.");
    const ownership = document.documentType.split(":");
    if (ownership.length >= 3 && ownership[1] !== piece.governmentEntityId) throw new AccessError("Documento registrado para outra entidade.", 403);
    if (await tx.planningDocumentLink.count({ where: { documentId: document.id, instrument: { governmentEntityId: { not: piece.governmentEntityId } } } })) throw new AccessError("O documento pertence a outra entidade.", 403);
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await snapshotVersion(tx, context, piece.id, new Date(), canonical?.legalActNumber ?? "Vinculação GED", "Antes da vinculação documental");
    const link = await tx.planningDocumentLink.create({ data: { ...input, documentVersionId: document.versions[0].id, targetKey, createdById: context.user.id } });
    if (input.purpose === "LEGAL_ACT") {
      if (piece.multiYearPlanId) await tx.multiYearPlan.update({ where: { id: piece.multiYearPlanId }, data: { legalDocumentId: document.id } });
      if (piece.budgetGuidelineId) await tx.budgetGuideline.update({ where: { id: piece.budgetGuidelineId }, data: { legalDocumentId: document.id } });
      if (piece.annualBudgetLawId) await tx.annualBudgetLaw.update({ where: { id: piece.annualBudgetLawId }, data: { legalDocumentId: document.id } });
    }
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_DOCUMENT_LINK", entityType: "PLANNING_INSTRUMENT", entityId: piece.id, payload: { documentId: document.id, versionId: document.versions[0].id, hash: document.versions[0].hashSha256, purpose: input.purpose, hearingId: input.hearingId ?? null } } });
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await finalizeLegalRevision(tx, context, piece, new Date(), canonical?.legalActNumber ?? "Vinculação GED", "Documento GED vinculado à versão preservada");
    return link.id;
}

export async function ingestPlanningDocument(context: PlanningContext, raw: unknown, file: File, store: typeof uploadFile = uploadFile) {
  assertPlanningOperation(context, "update");
  if (!canPerformModuleOperation(context.user, "DOCUMENTOS", "create")) throw new AccessError("Ingresso GED exige autorização de criação documental.", 403);
  const input = z.object({ instrumentId: z.string().min(1), hearingId: z.string().optional(), purpose: z.enum(["ANNEX", "LEGAL_ACT", "HEARING_MINUTES"]), title: z.string().trim().min(1).max(200), documentClassCode: z.string().min(1) }).parse(raw);
  const piece = await context.prisma.planningInstrument.findFirstOrThrow({ where: { id: input.instrumentId, ...planningInstrumentWhere(context) }, select: { governmentEntityId: true } });
  await assertDocumentScope(context.prisma, context, piece.governmentEntityId);
  validateUpload(file);
  if (input.purpose === "HEARING_MINUTES" && (!input.hearingId || !await context.prisma.planningHearing.count({ where: { id: input.hearingId, instrumentId: input.instrumentId } }))) throw new Error("Selecione audiência autorizada da peça.");
  await context.prisma.documentClass.findFirstOrThrow({ where: { code: input.documentClassCode, isActive: true, OR: [{ code: { startsWith: "PLANEJAMENTO" } }, { code: { startsWith: "PLANNING" } }] } });
  const blob = await store(file);
  let linkId = "";
  try { await ingestGedDocument(context.prisma, { title: input.title, documentType: `PLANEJAMENTO:${piece.governmentEntityId}:${input.purpose}`, documentClassCode: input.documentClassCode, fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => { linkId = await linkPlanningDocumentInTransaction(tx, context, { instrumentId: input.instrumentId, hearingId: input.hearingId, purpose: input.purpose, documentId }); } }); }
  catch (error) { if (store === uploadFile) await deleteUploadedDocument(blob).catch(() => undefined); throw error; }
  return linkId;
}

export async function requestPlanningDocumentSignatures(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ linkId: z.string().min(1), signerIds: z.string().min(1) }).parse(raw);
  if (!canPerformModuleOperation(context.user, "DOCUMENTOS", "update")) throw new AccessError("Solicitação de assinatura exige autorização documental.", 403);
  const link = await readPlanningDocument(context, input.linkId);
  const ids = [...new Set(input.signerIds.split(",").filter(Boolean))];
  if (!ids.length || ids.length > 20) throw new Error("Selecione de um a vinte assinantes.");
  await requestDocumentSignaturesForActor(context.prisma, context.user.id, link.documentId, ids, { planningInstrumentId: link.instrumentId, planningDocumentLinkId: link.id, planningDocumentVersionId: link.documentVersionId });
  return link.id;
}

export async function readPlanningDocument(context: PlanningContext, linkId: string) {
  const link = await context.prisma.planningDocumentLink.findFirst({ where: { id: linkId, instrument: planningInstrumentWhere(context) }, include: { document: true, documentVersion: true, instrument: { select: { governmentEntityId: true } } } });
  if (!link) throw new AccessError("Anexo não encontrado na entidade autorizada.", 404);
  await assertDocumentScope(context.prisma, context, link.instrument.governmentEntityId);
  return { ...link, version: link.documentVersion };
}
