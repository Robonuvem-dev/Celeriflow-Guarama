import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AccessError, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getFile, uploadGeneratedFinancialFile } from "@/lib/platform/blob";
import { generateReportPdf } from "@/lib/financeiro/report-export";
import { renderTabularCsv } from "@/lib/reports/tabular-renderers";
import { createDefaultReportTemplate, type ReportEmissionMetadata, type ReportInstitutionIdentity } from "@/lib/reports/report-template";
import { assertPlanningLegalAuthority, assertPlanningOperation, planningInstrumentWhere, type PlanningContext } from "./access";
import { assertWholePiece, canonicalPiece, lockLegalInstrument } from "./operations-core";
import { readPreservedPlanningReport } from "./reports";
import { planningPdfDataset } from "./report-presentation";
import type { InternalReportDataset } from "@/lib/financeiro/report-delivery";

type Db = PrismaClient | Prisma.TransactionClient;
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

export async function publishPlanningReport(context: PlanningContext, raw: unknown, storage: PlanningPublicationStorage = planningPublicationStorage) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "TRANSPARENCIA", "create")) throw new AccessError("Publicação exige autorização na Transparência.", 403);
  const input = z.object({ snapshotId: z.string().min(1), format: z.enum(["PDF", "CSV"]).default("PDF"), reason: z.string().trim().min(3) }).parse(raw);
  const snapshot = await readPreservedPlanningReport(context, input.snapshotId);
  const filters = snapshot.filters as unknown as { instrumentIds: string; targetId?: string };
  const ids = [...new Set([...filters.instrumentIds.split(","), ...(filters.targetId ? [filters.targetId] : [])])].sort();
  const lease = randomUUID();
  const claim = await context.prisma.$transaction(async (tx) => {
    for (const id of ids) { const piece = await lockLegalInstrument(tx, context, id); await assertWholePiece(tx, context, id); if (canonicalPiece(piece)?.status !== "PUBLISHED") throw new Error("Publicação pública exige todas as peças selecionadas publicadas no fluxo legal."); }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PlanningPublication:${snapshot.id}:${input.format}`}))`;
    let publication = await tx.planningReportPublication.findUnique({ where: { snapshotId_format: { snapshotId: snapshot.id, format: input.format } } });
    if (!publication) publication = await tx.planningReportPublication.create({ data: { snapshotId: snapshot.id, format: input.format, publicKey: randomUUID(), filename: `planejamento-${snapshot.reportType.toLowerCase()}-${snapshot.dataset.year}.${input.format.toLowerCase()}`, contentType: input.format === "PDF" ? "application/pdf" : "text/csv; charset=utf-8", title: snapshot.dataset.title, requestedById: context.user.id, reason: input.reason } });
    if (publication.status === "PUBLISHED") return { publication, claimed: false };
    if (publication.status === "WITHDRAWN") throw new Error("Documento retirado; emita nova versão para republicar.");
    if (publication.status === "ARCHIVING" && publication.leaseExpiresAt && publication.leaseExpiresAt > new Date()) throw new Error("Publicação em processamento; consulte o estado antes de repetir.");
    const claimed = await tx.planningReportPublication.update({ where: { id: publication.id }, data: { status: "ARCHIVING", leaseToken: lease, leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: { increment: 1 }, lastError: null } });
    await tx.planningPublicationEvent.create({ data: { publicationId: publication.id, type: "ARCHIVE_REQUESTED", actorId: context.user.id, payload: { datasetHash: snapshot.hash, attempt: claimed.attempts, kind: "REVIEW_COPY" } } });
    return { publication: claimed, claimed: true };
  });
  const publicUrl = `/api/transparencia/planejamento/${claim.publication.publicKey}`;
  if (!claim.claimed) return { id: claim.publication.id, status: "PUBLISHED" as const, publicUrl, fileHash: claim.publication.fileHash };
  try {
    let fileUrl = claim.publication.fileUrl, fileHash = claim.publication.fileHash;
    if (!fileUrl || !fileHash) {
      const bytes = await renderPlanningPublication(snapshot.dataset, input.format);
      fileHash = sha(bytes);
      fileUrl = await storage.put(claim.publication.filename, bytes, claim.publication.contentType);
      const saved = await context.prisma.planningReportPublication.updateMany({ where: { id: claim.publication.id, leaseToken: lease, status: "ARCHIVING" }, data: { fileUrl, fileHash } });
      if (!saved.count) throw new Error("A concessão de publicação expirou; não foi confirmado o arquivo desta tentativa.");
    }
    const actual = await storage.get(fileUrl);
    if (!actual || sha(actual) !== fileHash) throw new Error("Arquivo arquivado indisponível ou hash divergente; publicação não confirmada.");
    await context.prisma.$transaction(async (tx) => {
      for (const id of ids) { const piece = await lockLegalInstrument(tx, context, id); await assertWholePiece(tx, context, id); if (canonicalPiece(piece)?.status !== "PUBLISHED") throw new Error("A situação legal mudou durante a publicação."); }
      const finalized = await tx.planningReportPublication.updateMany({ where: { id: claim.publication.id, leaseToken: lease, status: "ARCHIVING" }, data: { status: "PUBLISHED", publishedAt: new Date(), leaseToken: null, leaseExpiresAt: null, lastError: null } });
      if (!finalized.count) throw new Error("Estado de publicação mudou durante a confirmação.");
      await tx.planningPublicationEvent.create({ data: { publicationId: claim.publication.id, type: "PUBLISHED", actorId: context.user.id, payload: { publicUrl, fileHash, datasetHash: snapshot.hash, kind: "REVIEW_COPY" } } });
    });
    return { id: claim.publication.id, status: "PUBLISHED" as const, publicUrl, fileHash };
  } catch (error) {
    await context.prisma.$transaction(async (tx) => {
      const failed = await tx.planningReportPublication.updateMany({ where: { id: claim.publication.id, leaseToken: lease, status: "ARCHIVING" }, data: { status: "FAILED", lastError: "Arquivo/publicação não confirmado; consulte a evidência da tentativa.", leaseToken: null, leaseExpiresAt: null } });
      if (failed.count) await tx.planningPublicationEvent.create({ data: { publicationId: claim.publication.id, type: "FAILED", actorId: context.user.id, payload: { reason: "STORAGE_OR_CONFIRMATION_FAILED", datasetHash: snapshot.hash } } });
    });
    throw error;
  }
}

export async function withdrawPlanningPublication(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "TRANSPARENCIA", "update")) throw new AccessError("Retirada exige autorização na Transparência.", 403);
  const input = z.object({ publicationId: z.string().min(1), reason: z.string().trim().min(3) }).parse(raw);
  const publication = await context.prisma.planningReportPublication.findFirstOrThrow({ where: { id: input.publicationId, snapshot: { instrument: planningInstrumentWhere(context) } } });
  await readPreservedPlanningReport(context, publication.snapshotId);
  return context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PlanningReportPublication" WHERE id=${publication.id} FOR UPDATE`;
    const current = await tx.planningReportPublication.findUniqueOrThrow({ where: { id: publication.id } });
    if (current.status === "WITHDRAWN") return current.id;
    if (current.status !== "PUBLISHED") throw new Error("Somente publicação confirmada pode ser retirada.");
    await tx.planningReportPublication.update({ where: { id: current.id }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
    await tx.planningPublicationEvent.create({ data: { publicationId: current.id, type: "WITHDRAWN", actorId: context.user.id, payload: { reason: input.reason, fileHash: current.fileHash } } });
    return current.id;
  });
}

export async function readPlanningPublishedFile(db: Db, publicKey: string, storage: PlanningPublicationStorage = planningPublicationStorage) {
  const publication = await db.planningReportPublication.findFirst({ where: { publicKey, status: "PUBLISHED" }, select: { fileUrl: true, fileHash: true, filename: true, contentType: true } });
  if (!publication?.fileUrl || !publication.fileHash) throw new AccessError("Documento público não encontrado.", 404);
  const bytes = await storage.get(publication.fileUrl);
  if (!bytes || sha(bytes) !== publication.fileHash) throw new AccessError("Arquivo público indisponível ou integridade não confirmada.", 423);
  return { bytes, filename: publication.filename, contentType: publication.contentType, hash: publication.fileHash };
}

export async function readPlanningArchivedFile(context: PlanningContext, snapshotId: string, format: "PDF" | "CSV", storage: PlanningPublicationStorage = planningPublicationStorage) {
  await readPreservedPlanningReport(context, snapshotId);
  const [runtime] = await context.prisma.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"PlanningReportPublication"') IS NOT NULL AS ready`;
  if (!runtime?.ready) return null;
  const publication = await context.prisma.planningReportPublication.findUnique({ where: { snapshotId_format: { snapshotId, format } } });
  if (!publication?.fileUrl || !publication.fileHash) return null;
  const bytes = await storage.get(publication.fileUrl);
  if (!bytes || sha(bytes) !== publication.fileHash) throw new AccessError("Arquivo preservado indisponível ou hash divergente.", 423);
  return { bytes, filename: publication.filename, contentType: publication.contentType, hash: publication.fileHash };
}

export async function listPlanningPublications(db: Db, raw: unknown) {
  const input = z.object({ year: z.coerce.number().int().min(1900).max(2200).optional(), entity: z.string().max(200).optional(), page: z.coerce.number().int().positive().default(1) }).parse(raw);
  const [runtime] = await db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"PlanningReportPublication"') IS NOT NULL AS ready`;
  if (!runtime?.ready) return { total: 0, page: 1, records: [] };
  const where = { status: "PUBLISHED", snapshot: { instrument: { ...(input.year ? { startYear: input.year } : {}), ...(input.entity ? { governmentEntity: { name: { contains: input.entity, mode: "insensitive" as const } } } : {}) } } };
  const total = await db.planningReportPublication.count({ where });
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const records = await db.planningReportPublication.findMany({ where, select: { publicKey: true, title: true, format: true, fileHash: true, publishedAt: true, snapshot: { select: { reportType: true, instrument: { select: { startYear: true, governmentEntity: { select: { name: true } } } } } } }, take: 20, skip: (page - 1) * 20, orderBy: [{ publishedAt: "desc" }, { publicKey: "asc" }] });
  return { total, page, records: records.map((record) => ({ title: record.title, year: record.snapshot.instrument.startYear, entity: record.snapshot.instrument.governmentEntity.name, type: record.snapshot.reportType, format: record.format, publishedAt: record.publishedAt?.toISOString() ?? null, hash: record.fileHash, url: `/api/transparencia/planejamento/${record.publicKey}`, completeness: "Documento para conferência — leiaute não homologado" })) };
}

export async function listPlanningPublicationManagement(context: PlanningContext, instrumentId: string, requestedPage = 1) {
  assertPlanningOperation(context, "issueReports");
  await context.prisma.planningInstrument.findFirstOrThrow({ where: { id: instrumentId, ...planningInstrumentWhere(context) }, select: { id: true } });
  const allowed = await context.prisma.planningInstrument.findMany({ where: planningInstrumentWhere(context), select: { id: true } });
  const ids = allowed.map((piece) => piece.id);
  if (!ids.length) return { total: 0, page: 1, records: [] };
  const units = isSystemAdministrator(context.user) ? Prisma.sql`TRUE` : Prisma.sql`filters ? 'snapshotUnitIds' AND filters->'snapshotUnitIds' <@ ${JSON.stringify(context.user.allowedBudgetUnitIds)}::jsonb`;
  const scope = Prisma.sql`"instrumentId"=${instrumentId} AND ${units} AND NOT EXISTS (SELECT 1 FROM unnest(string_to_array(filters->>'instrumentIds', ',')) AS selected(id) WHERE selected.id NOT IN (${Prisma.join(ids)})) AND (COALESCE(filters->>'targetId','')='' OR filters->>'targetId' IN (${Prisma.join(ids)}))`;
  const [count] = await context.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "PlanningReportSnapshot" WHERE ${scope}`);
  const total = Number(count.total); const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const selected = await context.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "PlanningReportSnapshot" WHERE ${scope} ORDER BY "createdAt" DESC,id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const records = await context.prisma.planningReportSnapshot.findMany({ where: { id: { in: selected.map((row) => row.id) } }, select: { id: true, reportType: true, hash: true, createdAt: true, publications: { select: { id: true, status: true, format: true, publicKey: true, fileHash: true, attempts: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  return { total, page, records };
}
