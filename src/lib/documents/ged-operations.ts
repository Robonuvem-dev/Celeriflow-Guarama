import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { gedEntryScope, requireGedObject } from "./ged-access";
import { gedActivity, requireGedConfiguration } from "./ged-governance";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { getBlobDocumentPrefix, deleteUploadedDocument } from "@/lib/platform/blob";

export async function gedOperationsCommand(context: AppContext, command: string, id: string, data: Record<string, unknown>) {
  const database = context.database ?? db;
  if (command === "save-appearance") {
    requireGedConfiguration(context); const { gedAppearanceSchema } = await import("./ged-appearance"); const input = gedAppearanceSchema.parse(data);
    await database.execute(sql`INSERT INTO "GedSetting"(key,value) VALUES('appearance',${JSON.stringify(input)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    return { saved: true };
  }
  if (command === "save-providers") {
    requireGedConfiguration(context);
    const { gedProvidersSchema } = await import("./ged-provider-config"); const input = gedProvidersSchema.parse(data);
    await database.execute(sql`INSERT INTO "GedSetting"(key,value) VALUES('providers',${JSON.stringify(input)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    const { insertAuditEvent } = await import("@/db/repositories/platform/audit");
    await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "GED_PROVIDERS", targetId: "providers" });
    return { saved: true };
  }
  if (command === "save-event") {
    const input = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(5000), startsAt: z.coerce.date(), endsAt: z.coerce.date(), timezone: z.string().max(100), documentId: z.string().nullable().default(null), participants: z.array(z.string().min(1)).max(100).default([]) }).refine(v => v.endsAt > v.startsAt, "O término deve ser posterior ao início.").parse(data);
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone });
    if (input.documentId) await requireManagedDocument(context, input.documentId);
    const key = id || randomUUID();
    const participants = [...new Set(input.participants)];
    for (const userId of participants) { const person = await database.execute(sql`SELECT 1 FROM "Usuario" WHERE id=${userId} AND ativo`); if (!person.rows.length) throw new Error("Participante inativo ou inválido."); }
    await database.execute(sql`INSERT INTO "GedCalendarEvent"(id,"ownerId",title,description,"startsAt","endsAt",timezone,"documentId",participants) VALUES(${key},${context.user.id},${input.title},${input.description},${input.startsAt},${input.endsAt},${input.timezone},${input.documentId},${JSON.stringify(participants)}::jsonb) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,"startsAt"=excluded."startsAt","endsAt"=excluded."endsAt",timezone=excluded.timezone,"documentId"=excluded."documentId",participants=excluded.participants WHERE "GedCalendarEvent"."ownerId"=${context.user.id}`);
    return { id: key };
  }
  if (command === "delete-event") {
    await database.execute(sql`DELETE FROM "GedCalendarEvent" WHERE id=${id} AND "ownerId"=${context.user.id}`); return { id };
  }
  if (command === "complete-task") {
    const tasks = await database.execute<{ documentId: string }>(sql`SELECT "documentId" FROM "GedTask" WHERE id=${id} AND "userId"=${context.user.id}`);
    if (!tasks.rows[0]) throw new Error("Tarefa não encontrada.");
    await requireManagedDocument(context, tasks.rows[0].documentId);
    await database.execute(sql`UPDATE "GedTask" SET status='COMPLETED' WHERE id=${id} AND "userId"=${context.user.id}`); return { id };
  }
  if (command === "save-settings") {
    requireGedConfiguration(context);
    const input = z.object({ autoProcess: z.boolean(), maxAttempts: z.number().int().min(1).max(20), semantic: z.boolean(), pdfaValidation: z.boolean(), timezone: z.string().max(100) }).parse(data);
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone });
    await database.execute(sql`INSERT INTO "GedSetting"(key,value) VALUES('operations',${JSON.stringify(input)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value`); return input;
  }
  if (command === "validate-pdfa") {
    await requireGedObject(context, "document", id, "edit"); const document = await requireManagedDocument(context, id);
    if (document.mimeType !== "application/pdf") throw new Error("Selecione PDF para validar conformidade.");
    const { readGedBytes } = await import("./ged-storage"); const { validateGedPdfA } = await import("./ged-processing");
    const report = await validateGedPdfA(await readGedBytes(document.fileUrl, document.hashSha256));
    await gedActivity(database, context, id, "PDFA_VALIDATION", report); return report;
  }
  if (command === "combine-images") {
    const selections = z.array(z.object({ id: z.string().min(1), versionId: z.string().optional() })).min(1).max(50).parse(data.items ?? z.array(z.string()).parse(data.ids).map(id => ({ id })));
    const { readGedBytes } = await import("./ged-storage"); const { imagesToGedPdf } = await import("./ged-processing");
    const images: Buffer[] = []; let size = 0;
    for (const selection of selections) {
      const image = await requireManagedDocument(context, selection.id);
      const versions = await database.execute<{ fileUrl: string; hash: string; mimeType: string }>(sql`SELECT v."fileUrl",v."hashSha256" AS hash,coalesce(f."mimeType",e."mimeType") AS "mimeType" FROM "DocumentVersion" v JOIN "GedEntry" e ON e."documentId"=v."documentId" LEFT JOIN "GedVersionFile" f ON f."versionId"=v.id WHERE v.id=${selection.versionId || image.versionId} AND v."documentId"=${image.id}`);
      const version = versions.rows[0]; if (!version?.mimeType.startsWith("image/")) throw new Error("Selecione apenas versões de imagens, na ordem das páginas.");
      const bytes = await readGedBytes(version.fileUrl, version.hash); size += bytes.length; if (size > 60 * 1024 * 1024) throw new Error("Seleção superior a 60 MiB."); images.push(bytes);
    }
    const pdf = await imagesToGedPdf(images); if (pdf.length > 20 * 1024 * 1024) throw new Error("PDF superior a 20 MiB.");
    const { prepareGedUpload, confirmGedUpload } = await import("./ged-service"); const { put } = await import("@vercel/blob");
    const title = z.string().trim().min(1).max(200).parse(data.title); const uploadId = randomUUID();
    const upload = await prepareGedUpload(context, { id: uploadId, batchId: uploadId, filename: `${title}.pdf`, title, classCode: z.string().parse(data.classCode), indexValues: data.indexValues ?? {} });
    const blob = await put(upload.pathname, pdf, { access: "private", contentType: "application/pdf", addRandomSuffix: false });
    const created = await confirmGedUpload(context, uploadId, blob.url, "PDF gerado a partir de imagens digitalizadas.");
    await gedActivity(database, context, created.documentId, "COMBINE_IMAGES", { sources: selections }); return created;
  }
  if (command === "purge") {
    requireGedConfiguration(context); await requireGedObject(context, "document", id, "delete");
    // Durable per-object lock is shared with signature/version mutations.
    return withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${id}`}))`);
      const eligible = await tx.execute(sql`SELECT 1 FROM "GedEntry" e JOIN "Document" d ON d.id=e."documentId" JOIN "GedMetadata" m ON m."documentId"=d.id WHERE d.id=${id} AND e.archived AND m."deletedAt" IS NOT NULL AND m."purgedAt" IS NULL AND d."createdAt" + make_interval(months=>d."retentionMonths")<=now()`);
      if (!eligible.rows.length) throw new Error("Documento não excluído ou prazo de retenção ainda vigente.");
      const references = await tx.execute(sql`SELECT 1 FROM "DocumentSignature" WHERE "documentId"=${id} UNION ALL SELECT 1 FROM "GedCentralSignature" cs JOIN "DocumentVersion" v ON v.id=cs."versionId" WHERE v."documentId"=${id} UNION ALL SELECT 1 FROM "GedPublicationLink" WHERE "documentId"=${id} UNION ALL SELECT 1 FROM "GedIntegrationLink" WHERE "documentId"=${id} UNION ALL SELECT 1 FROM "GedOperationLease" WHERE "documentId"=${id} AND "expiresAt">now()`);
      if (references.rows.length) throw new Error("Documento possui evidências ou vínculos que impedem descarte físico.");
      const files = await tx.execute<{ url: string; id: string }>(sql`SELECT v."fileUrl" AS url,v.id FROM "DocumentVersion" v WHERE v."documentId"=${id} UNION ALL SELECT a.url,a.id FROM "GedArtifact" a JOIN "DocumentVersion" v ON v.id=a."versionId" WHERE v."documentId"=${id}`);
      for (const file of files.rows) {
        const shared = await tx.execute(sql`SELECT 1 FROM "DocumentVersion" WHERE "fileUrl"=${file.url} AND "documentId"<>${id} UNION ALL SELECT 1 FROM "TransparencyPublication" WHERE "fileUrl"=${file.url} UNION ALL SELECT 1 FROM "Document" WHERE "fileUrl"=${file.url} AND id<>${id}`);
        if (shared.rows.length) throw new Error("Arquivo ainda referenciado por outro registro.");
        await tx.execute(sql`INSERT INTO "GedDisposal"(id,"documentId",url,status) VALUES(${file.id},${id},${file.url},'PENDING') ON CONFLICT(id) DO NOTHING`);
      }
      return { id, queued: files.rows.length };
    });
  }
  if (command === "dispose-files") {
    requireGedConfiguration(context);
    const pending = await database.execute<{ id: string; documentId: string; url: string }>(sql`SELECT * FROM "GedDisposal" WHERE status<>'DONE' ORDER BY id LIMIT 20`);
    for (const entry of pending.rows) {
      await requireGedObject(context, "document", entry.documentId, "delete");
      try {
        const references = await database.execute(sql`SELECT 1 FROM "DocumentVersion" WHERE "fileUrl"=${entry.url} AND "documentId"<>${entry.documentId} UNION ALL SELECT 1 FROM "Document" WHERE "fileUrl"=${entry.url} AND id<>${entry.documentId} UNION ALL SELECT 1 FROM "TransparencyPublication" WHERE "fileUrl"=${entry.url} UNION ALL SELECT 1 FROM "DocumentSignature" WHERE "documentId"=${entry.documentId} UNION ALL SELECT 1 FROM "GedIntegrationLink" WHERE "documentId"=${entry.documentId}`);
        if (references.rows.length) throw new Error("Arquivo ainda referenciado.");
        const { head, BlobNotFoundError } = await import("@vercel/blob");
        try {
          const stored = await head(entry.url);
          if (!stored.pathname.startsWith(`${getBlobDocumentPrefix()}ged/`) && !stored.pathname.startsWith(`${getBlobDocumentPrefix()}ged-derived/`)) throw new Error("Namespace não gerenciado.");
          await deleteUploadedDocument(stored);
        } catch (error) { if (!(error instanceof BlobNotFoundError)) throw error; }
        await database.execute(sql`UPDATE "GedDisposal" SET status='DONE',error=NULL WHERE id=${entry.id}`);
        await database.execute(sql`UPDATE "GedMetadata" SET "purgedAt"=now() WHERE "documentId"=${entry.documentId} AND NOT EXISTS(SELECT 1 FROM "GedDisposal" WHERE "documentId"=${entry.documentId} AND status<>'DONE')`);
        await gedActivity(database, context, entry.documentId, "DISPOSE_FILE", { fileId: entry.id });
      } catch { await database.execute(sql`UPDATE "GedDisposal" SET status='FAILED',error='Falha ao descartar arquivo; repita a operação.' WHERE id=${entry.id}`); }
    }
    return { processed: pending.rows.length };
  }
  throw new Error("Operação documental desconhecida.");
}

export async function readGedPersonal(context: AppContext, from: string, to: string) {
  const database = context.database ?? db;
  const start = z.coerce.date().parse(from); const end = z.coerce.date().parse(to);
  if (end <= start || end.getTime() - start.getTime() > 370 * 86400000) throw new Error("Selecione um intervalo de até um ano.");
  const events = await database.execute(sql`SELECT ev.* FROM "GedCalendarEvent" ev WHERE (ev."ownerId"=${context.user.id} OR ev.participants ? ${context.user.id}) AND ev."startsAt"<${end} AND ev."endsAt">${start} AND (ev."documentId" IS NULL OR EXISTS(SELECT 1 FROM "GedEntry" e WHERE e."documentId"=ev."documentId" AND NOT e.archived AND ${gedEntryScope(context)})) ORDER BY ev."startsAt" LIMIT 1000`);
  const tasks = await database.execute(sql`SELECT t.*,d.title AS "documentTitle" FROM "GedTask" t JOIN "Document" d ON d.id=t."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE t."userId"=${context.user.id} AND t.status='OPEN' AND NOT e.archived AND ${gedEntryScope(context)} ORDER BY t."dueAt" LIMIT 100`);
  const documents = await database.execute(sql`SELECT d.id,d.title,e."editorialStatus",m."validUntil",EXISTS(SELECT 1 FROM "GedFavorite" f WHERE f."documentId"=d.id AND f."userId"=${context.user.id}) favorite FROM "Document" d JOIN "GedEntry" e ON e."documentId"=d.id LEFT JOIN "GedMetadata" m ON m."documentId"=d.id WHERE NOT e.archived AND ${gedEntryScope(context)} ORDER BY d."createdAt" DESC LIMIT 100`);
  const preference = await database.execute<{ settings: unknown }>(sql`SELECT settings FROM "GedPreference" WHERE "userId"=${context.user.id}`);
  const approvals = await database.execute(sql`SELECT d.id,d.title,r."dueAt" FROM "GedReview" r JOIN "Document" d ON d.id=r."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE r.status='ACTIVE' AND r.assignments @> jsonb_build_object((ARRAY['ELABORACAO','CONSENSO','APROVACAO','HOMOLOGACAO'])[r.stage+1],jsonb_build_array(${context.user.id}::text)) AND NOT e.archived AND ${gedEntryScope(context)} UNION ALL SELECT d.id,d.title,r."dueAt" FROM "GedFlowRun" r JOIN "GedFlowDefinition" f ON f.id=r."definitionId" JOIN "Document" d ON d.id=r."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE r.status='ACTIVE' AND EXISTS(SELECT 1 FROM jsonb_array_elements(f.graph->'nodes') n WHERE n->>'id'=r."nodeId" AND (n->'users') ? ${context.user.id}) AND NOT e.archived AND ${gedEntryScope(context)}`);
  const { gedSelectors } = await import("@/db/repositories/documents/ged"); const selectors = await gedSelectors(context);
  return { events: events.rows, tasks: tasks.rows, documents: documents.rows, approvals: approvals.rows, people: selectors.users, userId: context.user.id, settings: preference.rows[0]?.settings ?? { color: "#4338ca", dashlets: ["tasks", "activities", "documents", "favorites", "approvals", "expiry"] } };
}
