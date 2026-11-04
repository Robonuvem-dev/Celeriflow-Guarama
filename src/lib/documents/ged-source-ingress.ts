import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canUseGed } from "./ged-access";
import { gedActivity } from "./ged-governance";
import { prepareGedUpload, confirmGedUpload } from "./ged-service";
import { inspectGedBytes, gedHash } from "./ged-storage";

export type GedSourceModule = "PROCESSOS" | "PLANEJAMENTO" | "FINANCEIRO" | "OBRAS" | "RH";
export type GedSourceSnapshot = { title: string; filename: string; bytes: Buffer; sourceVersionId: string; sha256: string };
/** Each source implements record-level authorization and explicit permission to
 * export a governed copy. Clinical/health sources deliberately have no adapter.
 * The callback is server code, never a client-supplied URL or module grant. */
export type GedSourceAdapter = {
  module: GedSourceModule;
  readAuthorizedSnapshot: (context: AppContext, sourceId: string) => Promise<GedSourceSnapshot>;
};

export async function ingestGedSource(context: AppContext, adapter: GedSourceAdapter, sourceId: string, input: { classCode: string; indexValues: Record<string, unknown>; folderId?: string | null }) {
  if (!canUseGed(context.user, "import")) throw new Error("Sem permissão de ingresso no GED.");
  const snapshot = await adapter.readAuthorizedSnapshot(context, sourceId);
  const inspected = await inspectGedBytes(snapshot.filename, snapshot.bytes);
  if (inspected.hashSha256 !== snapshot.sha256) throw new Error("A origem não corresponde ao hash declarado.");
  const database = context.database ?? db;
  const fingerprint = gedHash(Buffer.from(JSON.stringify({ hash: snapshot.sha256, classCode: input.classCode, folderId: input.folderId ?? null, values: Object.entries(input.indexValues).sort(([a], [b]) => a.localeCompare(b)) })));
  await database.execute(sql`INSERT INTO "GedSourceImport"(module,"sourceId","sourceVersionId","uploadId","ownerId",fingerprint) VALUES(${adapter.module},${sourceId},${snapshot.sourceVersionId},${randomUUID()},${context.user.id},${fingerprint}) ON CONFLICT DO NOTHING`);
  const reservations = await database.execute<{ uploadId: string; ownerId: string; fingerprint: string; documentId: string | null }>(sql`SELECT * FROM "GedSourceImport" WHERE module=${adapter.module} AND "sourceId"=${sourceId} AND "sourceVersionId"=${snapshot.sourceVersionId}`);
  const reservation = reservations.rows[0];
  if (reservation.ownerId !== context.user.id || reservation.fingerprint !== fingerprint) throw new Error("Esta versão de origem já possui ingresso ou reserva com outra configuração.");
  if (reservation.documentId) {
    const { requireManagedDocument } = await import("@/db/repositories/documents/ged"); await requireManagedDocument(context, reservation.documentId);
    return { documentId: reservation.documentId };
  }
  const id = reservation.uploadId;
  const upload = await prepareGedUpload(context, { id, batchId: id, filename: snapshot.filename, title: snapshot.title, classCode: input.classCode, indexValues: input.indexValues, folderId: input.folderId ?? null, legacyReference: `${adapter.module}:${sourceId}:${snapshot.sourceVersionId}` });
  const { put } = await import("@vercel/blob");
  const blob = await put(upload.pathname, snapshot.bytes, { access: "private", contentType: inspected.mimeType, addRandomSuffix: false, allowOverwrite: true });
  const created = await confirmGedUpload(context, id, blob.url, `Cópia autorizada de ${adapter.module}; versão de origem ${snapshot.sourceVersionId}.`);
  await database.execute(sql`INSERT INTO "GedIntegrationLink"("documentId",module,"sourceId") VALUES(${created.documentId},${adapter.module},${sourceId}) ON CONFLICT DO NOTHING`);
  await database.execute(sql`UPDATE "GedSourceImport" SET "documentId"=${created.documentId} WHERE "uploadId"=${id}`);
  await gedActivity(database, context, created.documentId, "SOURCE_INGRESS", { module: adapter.module, sourceId, sourceVersionId: snapshot.sourceVersionId, hash: inspected.hashSha256 });
  return created;
}

export async function queryGedSource(context: AppContext, adapter: GedSourceAdapter, sourceId: string) {
  await adapter.readAuthorizedSnapshot(context, sourceId);
  const { gedEntryScope } = await import("./ged-access");
  return (await (context.database ?? db).execute(sql`SELECT d.id,d.title,e."editorialStatus",l.module,l."sourceId" FROM "GedIntegrationLink" l JOIN "GedEntry" e ON e."documentId"=l."documentId" JOIN "Document" d ON d.id=e."documentId" WHERE l.module=${adapter.module} AND l."sourceId"=${sourceId} AND NOT e.archived AND ${gedEntryScope(context)}`)).rows;
}
