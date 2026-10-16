import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { deleteUploadedDocument, getFile } from "@/lib/platform/blob";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export async function cleanUnusedFunctionalUploads(db: PrismaClient, actorId: string) {
  const parameter = await db.configuracaoParametroInstancia.findFirst({ where: { chave: "PORTAL_UNUSED_UPLOAD_RETENTION_HOURS" }, select: { valor: true } });
  const retention = z.number().int().min(1).max(8760).safeParse(parameter?.valor);
  if (!retention.success) return { configured: false, checked: 0, deleted: 0, retry: 0 };
  const limit = new Date(Date.now() - retention.data * 3600000);
  const candidates = await db.hrIntegrationEvent.findMany({ where: { domain: "PORTAL", eventType: "ANEXO_FUNCIONAL_RECEBIDO", OR: [{ status: "RECEBIDO", createdAt: { lt: limit } }, { status: "LIMPEZA_PENDENTE" }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
  let deleted = 0, retry = 0;
  for (const candidate of candidates) {
    const artifact = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "HrIntegrationEvent" WHERE id=${candidate.id} FOR UPDATE`;
      const current = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { id: candidate.id } });
      if (!["RECEBIDO", "LIMPEZA_PENDENTE"].includes(current.status) || current.status === "RECEBIDO" && current.result) return null;
      const payload = z.object({ documentId: z.string(), fileUrl: z.string().optional(), pathname: z.string().optional() }).parse(current.payload);
      const consumed = await tx.processDocument.count({ where: { documentId: payload.documentId } });
      const versions = await tx.documentVersion.findMany({ where: { documentId: payload.documentId }, select: { fileUrl: true, lockedAt: true, status: true } });
      if (consumed || versions.some(version => version.lockedAt || ["SIGNED", "PENDING_SIGNATURE"].includes(version.status))) return null;
      await tx.documentVersion.updateMany({ where: { documentId: payload.documentId, status: "FINAL", lockedAt: null }, data: { status: "CANCELLED" } });
      await tx.document.update({ where: { id: payload.documentId }, data: { status: "Cancelado" } });
      await tx.hrIntegrationEvent.update({ where: { id: current.id }, data: { status: "LIMPEZA_PENDENTE" } });
      return { fileUrl: payload.fileUrl || versions[0]?.fileUrl, pathname: payload.pathname };
    });
    if (!artifact?.fileUrl) continue;
    try {
      const stored = artifact.pathname ? { url: artifact.fileUrl, pathname: artifact.pathname } : (await getFile(artifact.fileUrl))?.blob;
      if (!stored) throw new Error("Storage indisponível para limpeza.");
      await deleteUploadedDocument(stored);
      await db.$transaction(async tx => {
        await tx.hrIntegrationEvent.update({ where: { id: candidate.id }, data: { status: "EXPIRADO", result: { expiredAt: new Date().toISOString(), retentionHours: retention.data } } });
        await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "UNUSED_FUNCTIONAL_UPLOAD", targetId: candidate.id });
      });
      deleted++;
    } catch { retry++; }
  }
  return { configured: true, checked: candidates.length, deleted, retry };
}
