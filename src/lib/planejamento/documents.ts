import "server-only";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { planningBudgetLaws, planningDocumentLinks, planningEntityUnits, planningGuidelines, planningHearings, planningInstruments, planningMultiYearPlans } from "@/db/schema/planning-budget";
import { documents } from "@/db/schema/registry";
import { documentClasses, documentVersions } from "@/db/schema/document-workflow";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { planningConnection, planningDatabase } from "./database";
import { canonicalPiece, finalizeLegalRevision, lockLegalInstrument, snapshotVersion } from "./operations-core";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { deleteUploadedDocument, uploadFile, validateUpload } from "@/lib/platform/blob";

const linkInput = z.object({ instrumentId: z.string().min(1), hearingId: z.string().min(1).optional(), documentId: z.string().min(1), purpose: z.enum(["ANNEX", "LEGAL_ACT", "HEARING_MINUTES"]) });
async function assertDocumentScope(tx: DatabaseExecutor, context: PlanningContext, entityId: string) {
  if (!isSystemAdministrator(context.user)) {
    const denied = await tx.select({ id: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, entityId), sql`NOT (${planningEntityUnits.budgetUnitId} = ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))`)).limit(1);
    if (denied.length) throw new AccessError("O documento contém o recorte integral da entidade; é necessário acesso a todas as unidades.", 403);
  }
}

export async function linkPlanningDocument(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = linkInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), tx => linkPlanningDocumentInTransaction(tx, context, input));
}

async function linkPlanningDocumentInTransaction(tx: DatabaseTransaction, context: PlanningContext, input: z.infer<typeof linkInput>) {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    await assertDocumentScope(tx, context, piece.governmentEntityId);
    const canonical = canonicalPiece(piece);
    if (input.purpose === "HEARING_MINUTES" && !input.hearingId) throw new Error("Selecione a audiência da ata.");
    if (input.purpose === "LEGAL_ACT" && ["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "") && canonical?.legalDocumentId && canonical.legalDocumentId !== input.documentId) throw new Error("O ato final de peça sancionada não pode ser substituído. Utilize revisão formal.");
    if (input.purpose === "LEGAL_ACT" && ["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) assertPlanningLegalAuthority(context);
    if (input.hearingId && !(await tx.select({ id: planningHearings.id }).from(planningHearings).where(and(eq(planningHearings.id, input.hearingId), eq(planningHearings.instrumentId, piece.id))).limit(1)).length) throw new AccessError("Audiência fora da peça autorizada.", 403);
    await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, input.documentId)).for("update");
    const targetKey = `${input.purpose}:${input.hearingId ?? "instrument"}`;
    const [preserved] = await tx.select().from(planningDocumentLinks).where(and(eq(planningDocumentLinks.instrumentId, piece.id), eq(planningDocumentLinks.documentId, input.documentId), eq(planningDocumentLinks.targetKey, targetKey))).limit(1);
    if (preserved) return preserved.id;
    const [document] = await tx.select().from(documents).where(and(eq(documents.id, input.documentId), eq(documents.status, "Válido"), sql`starts_with(${documents.documentType}, 'PLANEJAMENTO:')`, isNull(documents.personId), isNull(documents.companyId), sql`NOT EXISTS (SELECT 1 FROM "HealthClinicalDocument" h WHERE h."documentId" = ${documents.id})`, sql`NOT EXISTS (SELECT 1 FROM "SstCertificateDocument" s WHERE s."documentId" = ${documents.id})`, sql`NOT EXISTS (SELECT 1 FROM "HealthLabReport" l WHERE l."documentId" = ${documents.id})`)).limit(1);
    const [version] = await tx.select().from(documentVersions).where(and(eq(documentVersions.documentId, input.documentId), inArray(documentVersions.status, ["FINAL", "SIGNED"]))).orderBy(desc(documentVersions.versionNumber)).limit(1);
    if (!document || !version) throw new Error("Selecione um documento GED de Planejamento com versão final e hash. Documentos pessoais/clínicos não podem ser reutilizados.");
    const ownership = document.documentType.split(":");
    if (ownership.length >= 3 && ownership[1] !== piece.governmentEntityId) throw new AccessError("Documento registrado para outra entidade.", 403);
    if ((await tx.select({ id: planningDocumentLinks.id }).from(planningDocumentLinks).innerJoin(planningInstruments, eq(planningInstruments.id, planningDocumentLinks.instrumentId)).where(and(eq(planningDocumentLinks.documentId, document.id), ne(planningInstruments.governmentEntityId, piece.governmentEntityId))).limit(1)).length) throw new AccessError("O documento pertence a outra entidade.", 403);
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await snapshotVersion(tx, context, piece.id, new Date(), canonical?.legalActNumber ?? "Vinculação GED", "Antes da vinculação documental");
    const [link] = await tx.insert(planningDocumentLinks).values({ ...input, documentVersionId: version.id, targetKey, createdById: context.user.id }).returning();
    if (input.purpose === "LEGAL_ACT") {
      if (piece.multiYearPlanId) await tx.update(planningMultiYearPlans).set({ legalDocumentId: document.id }).where(eq(planningMultiYearPlans.id, piece.multiYearPlanId));
      if (piece.budgetGuidelineId) await tx.update(planningGuidelines).set({ legalDocumentId: document.id }).where(eq(planningGuidelines.id, piece.budgetGuidelineId));
      if (piece.annualBudgetLawId) await tx.update(planningBudgetLaws).set({ legalDocumentId: document.id }).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId));
    }
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_DOCUMENT_LINK", entityType: "PLANNING_INSTRUMENT", entityId: piece.id, payload: { documentId: document.id, versionId: version.id, hash: version.hashSha256, purpose: input.purpose, hearingId: input.hearingId ?? null } });
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await finalizeLegalRevision(tx, context, piece, new Date(), canonical?.legalActNumber ?? "Vinculação GED", "Documento GED vinculado à versão preservada");
    return link.id;
}

export async function ingestPlanningDocument(context: PlanningContext, raw: unknown, file: File, store: typeof uploadFile = uploadFile) {
  assertPlanningOperation(context, "update");
  if (!canPerformModuleOperation(context.user, "DOCUMENTOS", "create")) throw new AccessError("Ingresso GED exige autorização de criação documental.", 403);
  const input = z.object({ instrumentId: z.string().min(1), hearingId: z.string().optional(), purpose: z.enum(["ANNEX", "LEGAL_ACT", "HEARING_MINUTES"]), title: z.string().trim().min(1).max(200), documentClassCode: z.string().min(1) }).parse(raw);
  const db = planningDatabase(context);
  const [piece] = await db.select({ governmentEntityId: planningInstruments.governmentEntityId }).from(planningInstruments).where(and(eq(planningInstruments.id, input.instrumentId), planningInstrumentScope(context))).limit(1);
  if (!piece) throw new AccessError("Peça não encontrada neste escopo.", 404);
  await assertDocumentScope(db, context, piece.governmentEntityId);
  validateUpload(file);
  if (input.purpose === "HEARING_MINUTES" && (!input.hearingId || !(await db.select({ id: planningHearings.id }).from(planningHearings).where(and(eq(planningHearings.id, input.hearingId), eq(planningHearings.instrumentId, input.instrumentId))).limit(1)).length)) throw new Error("Selecione audiência autorizada da peça.");
  if (!(await db.select({ id: documentClasses.id }).from(documentClasses).where(and(eq(documentClasses.code, input.documentClassCode), eq(documentClasses.isActive, true), or(sql`starts_with(${documentClasses.code}, 'PLANEJAMENTO')`, sql`starts_with(${documentClasses.code}, 'PLANNING')`))).limit(1)).length) throw new Error("Classe documental de Planejamento não encontrada.");
  const blob = await store(file);
  let linkId = "";
  try { await ingestGedDocument(planningConnection(context), { title: input.title, documentType: `PLANEJAMENTO:${piece.governmentEntityId}:${input.purpose}`, documentClassCode: input.documentClassCode, fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => { linkId = await linkPlanningDocumentInTransaction(tx, context, { instrumentId: input.instrumentId, hearingId: input.hearingId, purpose: input.purpose, documentId }); } }); }
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
  await requestDocumentSignaturesForActor(planningConnection(context), context.user.id, link.documentId, ids, { planningInstrumentId: link.instrumentId, planningDocumentLinkId: link.id, planningDocumentVersionId: link.documentVersionId });
  return link.id;
}

export async function readPlanningDocument(context: PlanningContext, linkId: string) {
  const db = planningDatabase(context);
  const [row] = await db.select({ link: planningDocumentLinks, document: documents, documentVersion: documentVersions, governmentEntityId: planningInstruments.governmentEntityId }).from(planningDocumentLinks).innerJoin(planningInstruments, eq(planningInstruments.id, planningDocumentLinks.instrumentId)).innerJoin(documents, eq(documents.id, planningDocumentLinks.documentId)).innerJoin(documentVersions, eq(documentVersions.id, planningDocumentLinks.documentVersionId)).where(and(eq(planningDocumentLinks.id, linkId), planningInstrumentScope(context))).limit(1);
  if (!row) throw new AccessError("Anexo não encontrado na entidade autorizada.", 404);
  await assertDocumentScope(db, context, row.governmentEntityId);
  return { ...row.link, document: row.document, documentVersion: row.documentVersion, instrument: { governmentEntityId: row.governmentEntityId }, version: row.documentVersion };
}
