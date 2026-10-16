import "server-only";
import { z } from "zod";
import type { PrismaClient, Prisma } from "@prisma/client";
import { AccessError } from "@/lib/platform/tenant-context";
import { writeAuditEvent } from "@/lib/platform/audit-evidence";

export const cemeteryAttachmentTargetSchema = z.object({ targetType: z.enum(["LOTE", "SEPULTURA", "SEPULTAMENTO", "VELORIO", "CREMACAO"]), targetId: z.string().min(1).max(100) });
export type CemeteryAttachmentTarget = z.infer<typeof cemeteryAttachmentTargetSchema>;
export async function assertCemeteryAttachmentTarget(db: Prisma.TransactionClient, target: CemeteryAttachmentTarget) {
  const count = target.targetType === "LOTE" ? await db.cemeteryLot.count({ where: { id: target.targetId } }) : target.targetType === "SEPULTURA" ? await db.taxGrave.count({ where: { id: target.targetId } }) : await db.cemeteryProcess.count({ where: { id: target.targetId, processType: target.targetType } });
  if (!count) throw new AccessError("Destino do anexo não encontrado.", 404);
}
export async function ingestCemeteryAttachment(db: PrismaClient, actorId: string, target: CemeteryAttachmentTarget, input: { requestKey: string; title: string; fileUrl: string; hashSha256: string }) {
  return db.$transaction(async tx => {
    await assertCemeteryAttachmentTarget(tx, target);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cemetery-upload:${input.requestKey}`}))`;
    const repeated = await tx.cemeteryAttachment.findFirst({ where: { documentId: input.requestKey }, include: { document: { include: { versions: true } } } });
    if (repeated) {
      if (repeated.createdByUsuarioId !== actorId || repeated.targetId !== target.targetId || repeated.targetType !== target.targetType || repeated.document.versions[0]?.hashSha256 !== input.hashSha256) throw new AccessError("Chave de upload indisponível.", 403);
      return { id: repeated.id, created: false };
    }
    const document = await tx.document.create({ data: { id: input.requestKey, title: input.title, documentType: "CEMITERIO", fileUrl: input.fileUrl, status: "Válido", notes: "Upload próprio do módulo Cemitérios", versions: { create: { versionNumber: 1, fileUrl: input.fileUrl, hashSha256: input.hashSha256, status: "FINAL", lockedAt: new Date() } } } });
    const attachment = await tx.cemeteryAttachment.create({ data: { ...target, documentId: document.id, createdByUsuarioId: actorId } });
    await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: "GED_DOCUMENT_INGESTED", targetType: "CEMETERY_ATTACHMENT", targetId: attachment.id });
    return { id: attachment.id, created: true };
  });
}

export async function listCemeteryAttachments(db: PrismaClient, target: CemeteryAttachmentTarget, requestedPage = 1) {
  await assertCemeteryAttachmentTarget(db, target);
  const total = await db.cemeteryAttachment.count({ where: target });
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, Math.ceil(total / 20)));
  const items = await db.cemeteryAttachment.findMany({ where: target, include: { document: { select: { title: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 });
  return { total, page, items: items.map(i => ({ id: i.id, title: i.document.title, createdAt: i.createdAt.toISOString(), authorId: i.createdByUsuarioId })) };
}
