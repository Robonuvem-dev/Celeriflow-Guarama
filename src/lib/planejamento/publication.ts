import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import { withDatabaseTransaction } from "@/db/transaction";
import type { PlanningPublicationConnectionContext, PlanningPublicationContext } from "@/lib/contracts/planning-publication-operations";
import { claimPublication, failPublication, finalizePublication, insertPublication, insertPublicationEvent, listPublishedPublications, lockPublication, lockPublicationClaim, publicationBySnapshot, publicationManagement, publicationRuntimeReady, publishedPublication, savePublicationArtifact, scopedPublication, withdrawPublication } from "@/db/repositories/planning-publication-operations/records";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { getFile, uploadGeneratedFinancialFile } from "@/lib/platform/blob";
import { generateReportPdf } from "@/lib/financeiro/report-export";
import { renderTabularCsv } from "@/lib/reports/tabular-renderers";
import { createDefaultReportTemplate, type ReportEmissionMetadata, type ReportInstitutionIdentity } from "@/lib/reports/report-template";
import { assertPlanningLegalAuthority, assertPlanningOperation } from "./access";
import { planningDatabase } from "./database";
import { assertWholePiece, canonicalPiece, lockLegalInstrument } from "./operations-core";
import { readPreservedPlanningReport } from "./reports";
import { planningPdfDataset } from "./report-presentation";
import type { InternalReportDataset } from "@/lib/financeiro/report-delivery";

export type PlanningPublicationStorage = { put: (filename: string, bytes: Uint8Array, contentType: string) => Promise<string>; get: (url: string) => Promise<Uint8Array | null> };
export const planningPublicationStorage: PlanningPublicationStorage = {
  put: async (filename, bytes, contentType) => (await uploadGeneratedFinancialFile(filename, bytes, contentType)).url,
  get: async (url) => { const file = await getFile(url); return file?.stream ? new Uint8Array(await new Response(file.stream).arrayBuffer()) : null; },
};
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function renderPlanningPublication(dataset: InternalReportDataset, format: "PDF" | "CSV") {
  const document = dataset as InternalReportDataset & { planningIdentity?: ReportInstitutionIdentity; planningEmission?: ReportEmissionMetadata };
  const presentation = { institution: document.planningIdentity ?? null, template: { ...createDefaultReportTemplate(), orientation: "LANDSCAPE" as const }, emission: document.planningEmission ?? { issuedAt: new Date().toISOString(), issuedBy: "Emissão preservada" } };
  return format === "PDF" ? new Uint8Array(await generateReportPdf(planningPdfDataset(dataset), presentation)) : new TextEncoder().encode(renderTabularCsv(dataset, presentation));
}

export async function publishPlanningReport(context: PlanningPublicationConnectionContext, raw: unknown, storage: PlanningPublicationStorage = planningPublicationStorage) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "TRANSPARENCIA", "create")) throw new AccessError("Publicação exige autorização na Transparência.", 403);
  const input = z.object({ snapshotId: z.string().min(1), format: z.enum(["PDF", "CSV"]).default("PDF"), reason: z.string().trim().min(3) }).parse(raw);
  const connection = context.connection;
  const snapshot = await readPreservedPlanningReport({ ...context, database: connection.db }, input.snapshotId);
  const filters = z.object({ instrumentIds: z.string(), targetId: z.string().optional() }).parse(snapshot.filters);
  const ids = [...new Set([...filters.instrumentIds.split(","), ...(filters.targetId ? [filters.targetId] : [])])].sort();
  const lease = randomUUID();
  const claim = await withDatabaseTransaction(connection, async (tx) => {
    for (const id of ids) { const piece = await lockLegalInstrument(tx, context, id); await assertWholePiece(tx, context, id); if (canonicalPiece(piece)?.status !== "PUBLISHED") throw new Error("Publicação pública exige todas as peças selecionadas publicadas no fluxo legal."); }
    await lockPublicationClaim(tx, snapshot.id, input.format);
    let publication = await publicationBySnapshot(tx, snapshot.id, input.format);
    if (!publication) publication = await insertPublication(tx, { snapshotId: snapshot.id, format: input.format, publicKey: randomUUID(), filename: `planejamento-${snapshot.reportType.toLowerCase()}-${snapshot.dataset.year}.${input.format.toLowerCase()}`, contentType: input.format === "PDF" ? "application/pdf" : "text/csv; charset=utf-8", title: snapshot.dataset.title, requestedById: context.user.id, reason: input.reason });
    if (publication.status === "PUBLISHED") return { publication, claimed: false };
    if (publication.status === "WITHDRAWN") throw new Error("Documento retirado; emita nova versão para republicar.");
    if (publication.status === "ARCHIVING" && publication.leaseExpiresAt && publication.leaseExpiresAt > new Date()) throw new Error("Publicação em processamento; consulte o estado antes de repetir.");
    const claimed = await claimPublication(tx, publication.id, lease, new Date(Date.now() + 10 * 60 * 1000));
    await insertPublicationEvent(tx, publication.id, "ARCHIVE_REQUESTED", context.user.id, { datasetHash: snapshot.hash, attempt: claimed.attempts, kind: "REVIEW_COPY" });
    return { publication: claimed, claimed: true };
  });
  const publicUrl = `/api/transparencia/planejamento/${claim.publication.publicKey}`;
  if (!claim.claimed) return { id: claim.publication.id, status: "PUBLISHED" as const, publicUrl, fileHash: claim.publication.fileHash };
  try {
    let fileUrl = claim.publication.fileUrl, fileHash = claim.publication.fileHash;
    if (!fileUrl || !fileHash) {
      const bytes = await renderPlanningPublication(snapshot.dataset, input.format);
      const artifactHash = sha(bytes);
      const artifactUrl = await storage.put(claim.publication.filename, bytes, claim.publication.contentType);
      const saved = await withDatabaseTransaction(connection, tx => savePublicationArtifact(tx, claim.publication.id, lease, artifactUrl, artifactHash));
      if (!saved) throw new Error("A concessão de publicação expirou; não foi confirmado o arquivo desta tentativa.");
      fileUrl = artifactUrl;
      fileHash = artifactHash;
    }
    const actual = await storage.get(fileUrl);
    if (!actual || sha(actual) !== fileHash) throw new Error("Arquivo arquivado indisponível ou hash divergente; publicação não confirmada.");
    await withDatabaseTransaction(connection, async (tx) => {
      for (const id of ids) { const piece = await lockLegalInstrument(tx, context, id); await assertWholePiece(tx, context, id); if (canonicalPiece(piece)?.status !== "PUBLISHED") throw new Error("A situação legal mudou durante a publicação."); }
      const finalized = await finalizePublication(tx, claim.publication.id, lease);
      if (!finalized) throw new Error("Estado de publicação mudou durante a confirmação.");
      await insertPublicationEvent(tx, claim.publication.id, "PUBLISHED", context.user.id, { publicUrl, fileHash, datasetHash: snapshot.hash, kind: "REVIEW_COPY" });
    });
    return { id: claim.publication.id, status: "PUBLISHED" as const, publicUrl, fileHash };
  } catch (error) {
    await withDatabaseTransaction(connection, async (tx) => {
      const failed = await failPublication(tx, claim.publication.id, lease);
      if (failed) await insertPublicationEvent(tx, claim.publication.id, "FAILED", context.user.id, { reason: "STORAGE_OR_CONFIRMATION_FAILED", datasetHash: snapshot.hash });
    });
    throw error;
  }
}

export async function withdrawPlanningPublication(context: PlanningPublicationConnectionContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "TRANSPARENCIA", "update")) throw new AccessError("Retirada exige autorização na Transparência.", 403);
  const input = z.object({ publicationId: z.string().min(1), reason: z.string().trim().min(3) }).parse(raw);
  const connection = context.connection;
  const publication = await scopedPublication(connection.db, context, input.publicationId);
  await readPreservedPlanningReport({ ...context, database: connection.db }, publication.snapshotId);
  return withDatabaseTransaction(connection, async (tx) => {
    const current = await lockPublication(tx, publication.id);
    if (current.status === "WITHDRAWN") return current.id;
    if (current.status !== "PUBLISHED") throw new Error("Somente publicação confirmada pode ser retirada.");
    await withdrawPublication(tx, current.id);
    await insertPublicationEvent(tx, current.id, "WITHDRAWN", context.user.id, { reason: input.reason, fileHash: current.fileHash });
    return current.id;
  });
}

export async function readPlanningPublishedFile(db: DatabaseExecutor, publicKey: string, storage: PlanningPublicationStorage = planningPublicationStorage) {
  const publication = await publishedPublication(db, publicKey);
  if (!publication?.fileUrl || !publication.fileHash) throw new AccessError("Documento público não encontrado.", 404);
  const bytes = await storage.get(publication.fileUrl);
  if (!bytes || sha(bytes) !== publication.fileHash) throw new AccessError("Arquivo público indisponível ou integridade não confirmada.", 423);
  return { bytes, filename: publication.filename, contentType: publication.contentType, hash: publication.fileHash };
}

export async function readPlanningArchivedFile(context: PlanningPublicationContext, snapshotId: string, format: "PDF" | "CSV", storage: PlanningPublicationStorage = planningPublicationStorage) {
  await readPreservedPlanningReport(context, snapshotId);
  const database = planningDatabase(context);
  if (!await publicationRuntimeReady(database)) return null;
  const publication = await publicationBySnapshot(database, snapshotId, format);
  if (!publication?.fileUrl || !publication.fileHash) return null;
  const bytes = await storage.get(publication.fileUrl);
  if (!bytes || sha(bytes) !== publication.fileHash) throw new AccessError("Arquivo preservado indisponível ou hash divergente.", 423);
  return { bytes, filename: publication.filename, contentType: publication.contentType, hash: publication.fileHash };
}

export async function listPlanningPublications(db: DatabaseExecutor, raw: unknown) {
  const input = z.object({ year: z.coerce.number().int().min(1900).max(2200).optional(), entity: z.string().max(200).optional(), page: z.coerce.number().int().positive().default(1) }).parse(raw);
  if (!await publicationRuntimeReady(db)) return { total: 0, page: 1, records: [] };
  return listPublishedPublications(db, input);
}

export async function listPlanningPublicationManagement(context: PlanningPublicationContext, instrumentId: string, requestedPage = 1) {
  assertPlanningOperation(context, "issueReports");
  return publicationManagement(planningDatabase(context), context, instrumentId, requestedPage);
}
