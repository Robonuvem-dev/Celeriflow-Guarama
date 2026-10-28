import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { changePortalEvent, portalCount, portalFirst, portalRequired, portalRows } from "@/db/repositories/portal-servidor/records";
import type { PortalIntegrationEvent } from "@/lib/contracts/employee-portal";
import type { JsonValue } from "@/db/json";
import { z } from "zod";
import { deleteUploadedDocument, getFile } from "@/lib/platform/blob";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export async function cleanUnusedFunctionalUploads(connection: DatabaseConnection, actorId: string) {
  const db = connection.db;
  const parameter = await portalFirst<{ valor: JsonValue }>(db, sql`SELECT valor FROM "ConfiguracaoParametroInstancia" WHERE chave='PORTAL_UNUSED_UPLOAD_RETENTION_HOURS' LIMIT 1`);
  const retention = z.number().int().min(1).max(8760).safeParse(parameter?.valor);
  if (!retention.success) return { configured: false, checked: 0, deleted: 0, retry: 0 };
  const limit = new Date(Date.now() - retention.data * 3600000);
  const candidates = await portalRows<PortalIntegrationEvent>(db, sql`SELECT * FROM "HrIntegrationEvent" WHERE domain='PORTAL' AND "eventType"='ANEXO_FUNCIONAL_RECEBIDO' AND ((status='RECEBIDO' AND "createdAt"<${limit}) OR status='LIMPEZA_PENDENTE') ORDER BY "createdAt",id LIMIT 100`);
  let deleted = 0, retry = 0;
  for (const candidate of candidates) {
    const artifact = await withDatabaseTransaction(connection, async tx => {
      const current = await portalRequired<PortalIntegrationEvent>(tx, sql`SELECT * FROM "HrIntegrationEvent" WHERE id=${candidate.id} FOR UPDATE`);
      if (!["RECEBIDO", "LIMPEZA_PENDENTE"].includes(current.status) || current.status === "RECEBIDO" && current.result) return null;
      const payload = z.object({ documentId: z.string(), fileUrl: z.string().optional(), pathname: z.string().optional() }).parse(current.payload);
      const consumed = await portalCount(tx, sql`SELECT count(*) FROM "ProcessDocument" WHERE "documentId"=${payload.documentId}`);
      const versions = await portalRows<{ fileUrl: string; lockedAt: Date | null; status: string }>(tx, sql`SELECT "fileUrl","lockedAt",status FROM "DocumentVersion" WHERE "documentId"=${payload.documentId}`);
      if (consumed || versions.some(version => version.lockedAt || ["SIGNED", "PENDING_SIGNATURE"].includes(version.status))) return null;
      await tx.execute(sql`UPDATE "DocumentVersion" SET status='CANCELLED' WHERE "documentId"=${payload.documentId} AND status='FINAL' AND "lockedAt" IS NULL`);
      await tx.execute(sql`UPDATE "Document" SET status='Cancelado',"updatedAt"=${new Date()} WHERE id=${payload.documentId}`);
      await changePortalEvent(tx, current.id, { status: "LIMPEZA_PENDENTE" });
      return { fileUrl: payload.fileUrl || versions[0]?.fileUrl, pathname: payload.pathname };
    });
    if (!artifact?.fileUrl) continue;
    try {
      const stored = artifact.pathname ? { url: artifact.fileUrl, pathname: artifact.pathname } : (await getFile(artifact.fileUrl))?.blob;
      if (!stored) throw new Error("Storage indisponível para limpeza.");
      await deleteUploadedDocument(stored);
      await withDatabaseTransaction(connection, async tx => {
        await changePortalEvent(tx, candidate.id, { status: "EXPIRADO", result: { expiredAt: new Date().toISOString(), retentionHours: retention.data } });
        await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.administrativeMutation, targetType: "UNUSED_FUNCTIONAL_UPLOAD", targetId: candidate.id });
      });
      deleted++;
    } catch { retry++; }
  }
  return { configured: true, checked: candidates.length, deleted, retry };
}
