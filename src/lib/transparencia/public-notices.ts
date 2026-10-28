import { desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { processes } from "@/db/schema/processes";
import { publicNotices } from "@/db/schema/transparency";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { assertProcessNoticeCanBePublished, createPublicNoticeValidationCode, createRedactedProcessNotice, projectPublicNotice } from "./public-notice-policy";

export async function publishProcessPublicNotice(
  db: DatabaseConnection,
  actorUsuarioId: string,
  processId: string,
) {
  return withDatabaseTransaction(db, async (tx) => {
    const [process] = await tx.select({ id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status, isFromOmbudsman: sql<boolean>`EXISTS(SELECT 1 FROM "Ombudsman" o WHERE o."processId"=${processes.id})` }).from(processes).where(eq(processes.id, processId)).limit(1);
    if (!process) throw new Error("Processo nao encontrado.");
    assertProcessNoticeCanBePublished({ status: process.status, isFromOmbudsman: process.isFromOmbudsman });
    const notice = createRedactedProcessNotice({
      protocolNumber: process.protocolNumber,
    });
    const [created] = await tx.insert(publicNotices).values({
        sourceModule: "PROCESSOS",
        sourceEntityId: process.id,
        ...notice,
        validationCode: createPublicNoticeValidationCode(),
        publishedByUsuarioId: actorUsuarioId,
    }).returning({ id: publicNotices.id });
    await insertAuditEvent(tx, {
      actorUsuarioId,
      eventType: auditEventTypes.publicNoticePublished,
      targetType: "PUBLIC_NOTICE",
      targetId: created.id,
    });
    return created;
  }, { timeoutMs: 5_000 });
}

const publicProjection = { sourceModule: publicNotices.sourceModule, title: publicNotices.title, category: publicNotices.category, publishedAt: publicNotices.publishedAt, validationCode: publicNotices.validationCode };

export async function getPublicNotices(db: DatabaseExecutor) {
  const notices = await db.select(publicProjection).from(publicNotices).orderBy(desc(publicNotices.publishedAt)).limit(100);
  return notices.map(projectPublicNotice);
}

export async function findPublicNoticeValidation(db: DatabaseExecutor, validationCode: string) {
  const [notice] = await db.select(publicProjection).from(publicNotices).where(eq(publicNotices.validationCode, validationCode)).limit(1);
  return notice ? projectPublicNotice(notice) : null;
}
