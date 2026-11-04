import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { resolveIdentityUser } from "@/lib/platform/identity-service";
import { processGedVersion } from "./ged-service";
import { executeGedRules } from "./ged-workflow";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertInternalNotifications } from "@/db/repositories/platform/notifications";

export async function runGedWorkerBatch(limit = 3) {
  const settings = await db.execute<{ value: { autoProcess?: boolean; maxAttempts?: number } }>(sql`SELECT value FROM "GedSetting" WHERE key='operations'`);
  if (settings.rows[0]?.value.autoProcess === false) return { processed: 0, failed: 0 };
  const jobs = await db.execute<{ versionId: string; documentId: string; firebaseUid: string; email: string; name: string; attempts: number }>(sql`
    SELECT j."versionId",j.attempts,e."documentId",u."firebaseUid",u.email,u.nome AS name
    FROM "GedProcessingJob" j JOIN "DocumentVersion" v ON v.id=j."versionId" JOIN "GedEntry" e ON e."documentId"=v."documentId" JOIN "Usuario" u ON u.id=e."ownerId"
    WHERE NOT e.archived AND u.ativo AND u."firebaseUid" IS NOT NULL AND j.attempts<${settings.rows[0]?.value.maxAttempts ?? 5} AND j."nextAttemptAt"<=now()
    AND (j.status IN ('PENDING','FAILED') OR (j.status='RUNNING' AND j."leaseUntil"<now())) ORDER BY j."updatedAt" LIMIT ${Math.min(10, Math.max(1, limit))}`);
  let failed = 0;
  for (const job of jobs.rows) {
    try {
      const user = await resolveIdentityUser(db, { firebaseUid: job.firebaseUid, email: job.email, name: job.name, authTime: Date.now() / 1000 });
      const context = { user, database: db };
      await processGedVersion(context, job.versionId);
    } catch {
      failed++;
      await db.execute(sql`UPDATE "GedProcessingJob" SET status='FAILED',attempts=greatest(attempts,${job.attempts + 1}),"nextAttemptAt"=now()+interval '5 minutes',error='Processamento pendente: verifique acesso, conversor ou serviço OCR.' WHERE "versionId"=${job.versionId} AND status<>'SUCCEEDED' AND (status<>'RUNNING' OR "leaseUntil"<now())`);
    }
  }
  const events = await db.execute<{ id: string; documentId: string; event: string; firebaseUid: string; email: string; name: string }>(sql`SELECT q.*,u."firebaseUid",u.email,u.nome AS name FROM "GedEventQueue" q JOIN "GedEntry" e ON e."documentId"=q."documentId" JOIN "Usuario" u ON u.id=e."ownerId" WHERE NOT e.archived AND u.ativo AND u."firebaseUid" IS NOT NULL AND q.attempts<5 AND (q.status IN ('PENDING','FAILED') OR (q.status='RUNNING' AND q."leaseUntil"<now())) ORDER BY q."createdAt" LIMIT 10`);
  for (const event of events.rows) {
    const claimed = await db.execute(sql`UPDATE "GedEventQueue" SET status='RUNNING',attempts=attempts+1,"leaseUntil"=now()+interval '5 minutes' WHERE id=${event.id} AND (status IN ('PENDING','FAILED') OR "leaseUntil"<now()) RETURNING id`);
    if (!claimed.rows.length) continue;
    try {
      const user = await resolveIdentityUser(db, { firebaseUid: event.firebaseUid, email: event.email, name: event.name, authTime: Date.now() / 1000 });
      await executeGedRules({ user, database: db }, event.documentId, event.event, event.id);
      await db.execute(sql`UPDATE "GedEventQueue" SET status='DONE',"leaseUntil"=NULL WHERE id=${event.id}`);
    } catch { await db.execute(sql`UPDATE "GedEventQueue" SET status='FAILED',"leaseUntil"=NULL WHERE id=${event.id}`); }
  }
  return { processed: jobs.rows.length - failed, failed };
}

export async function runGedValidityBatch() {
  const due = await db.execute<{ documentId: string; responsibleId: string; validUntil: string; title: string; firebaseUid: string; email: string; name: string }>(sql`
    SELECT m."documentId",m."responsibleId",m."validUntil",d.title,u."firebaseUid",u.email,u.nome AS name FROM "GedMetadata" m JOIN "GedEntry" e ON e."documentId"=m."documentId" JOIN "Document" d ON d.id=m."documentId" JOIN "Usuario" u ON u.id=m."responsibleId"
    WHERE NOT e.archived AND u.ativo AND u."firebaseUid" IS NOT NULL AND m."validUntil" IS NOT NULL AND m."lastAlertedUntil" IS DISTINCT FROM m."validUntil" AND m."validUntil"-make_interval(days=>m."alertDays")<=now() ORDER BY m."validUntil" LIMIT 100`);
  for (const item of due.rows) {
    const user = await resolveIdentityUser(db, { firebaseUid: item.firebaseUid, email: item.email, name: item.name, authTime: Date.now() / 1000 }); const context = { user, database: db };
    try { await requireManagedDocument(context, item.documentId); } catch { continue; }
    const key = `validity:${item.documentId}:${new Date(item.validUntil).toISOString()}`;
    await db.execute(sql`INSERT INTO "GedTask"(id,"documentId","userId",title,"dueAt","dedupeKey") VALUES(${randomUUID()},${item.documentId},${item.responsibleId},${`Revalidar ou cancelar: ${item.title}`},${new Date(item.validUntil)},${key}) ON CONFLICT("dedupeKey") DO NOTHING`);
    await db.execute(sql`INSERT INTO "GedMailIntent"(id,"documentId","recipientId",subject,body,"dedupeKey") VALUES(${randomUUID()},${item.documentId},${item.responsibleId},'Validade documental',${`O documento ${item.title} exige revalidação ou cancelamento até ${item.validUntil}.`},${key}) ON CONFLICT("dedupeKey") DO NOTHING`);
    await withDatabaseTransaction(databaseConnection, tx => insertInternalNotifications(tx, { actorUsuarioId: user.id, recipientUserIds: [user.id], sourceModule: "ASSINATURA_DIGITAL", entityType: "GED_DOCUMENT", entityId: item.documentId, type: "GED_VALIDITY", title: "Validade documental", message: `Revalide ou cancele: ${item.title}`, dedupeDiscriminator: key }));
    await db.execute(sql`INSERT INTO "GedEventQueue"(id,"documentId",event) VALUES(${key},${item.documentId},'VALIDITY') ON CONFLICT(id) DO NOTHING`);
    await db.execute(sql`UPDATE "GedMetadata" SET "lastAlertedUntil"=${new Date(item.validUntil)} WHERE "documentId"=${item.documentId} AND "validUntil"=${new Date(item.validUntil)}`);
  }
  return { considered: due.rows.length };
}
