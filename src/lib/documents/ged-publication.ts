import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { publicationMetadataSchema, isTransparencyCollectionEnabled } from "@/lib/transparencia/publication-policy";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { publicDocumentTypes } from "@/lib/transparencia/publication-storage";
import { requireGedObject } from "./ged-access";
import { readGedBytes } from "./ged-storage";
import { gedActivity } from "./ged-governance";

export async function gedPublicationCommand(context: AppContext, command: string, documentId: string, data: Record<string, unknown>) {
  const database = context.database ?? db;
  await requireGedObject(context, "document", documentId, "share");
  const document = await requireManagedDocument(context, documentId);
  if (!canPerformModuleOperation(context.user, "TRANSPARENCIA", command === "publish-document" ? "create" : "update")) throw new Error("Sem permissão de publicação na Transparência.");
  if (command === "withdraw-publication") {
    const publicationId = z.string().min(1).parse(data.publicationId);
    await database.execute(sql`UPDATE "TransparencyPublication" p SET status='WITHDRAWN',"withdrawnAt"=now(),"updatedAt"=now() WHERE p.id=${publicationId} AND EXISTS(SELECT 1 FROM "GedPublicationLink" l WHERE l."publicationId"=p.id AND l."documentId"=${documentId})`);
    await gedActivity(database, context, documentId, "PUBLICATION_WITHDRAW", { publicationId }); return { id: publicationId };
  }
  if (command !== "publish-document") throw new Error("Operação de publicação desconhecida.");
  if (document.editorialStatus !== "HOMOLOGADO") throw new Error("Homologue a versão antes de publicar.");
  if (!publicDocumentTypes.includes(document.mimeType)) throw new Error("Formato não publicável. Gere uma versão PDF.");
  const input = publicationMetadataSchema.parse(data); const settings = await getTransparencySettings(database);
  if (!isTransparencyCollectionEnabled(input.collectionSlug, settings) || !settings.availableYears.includes(input.year)) throw new Error("Consulta ou exercício não habilitado para publicação.");
  await readGedBytes(document.fileUrl, document.hashSha256);
  const { getFile } = await import("@/lib/platform/blob"); const stored = await getFile(document.fileUrl); if (!stored) throw new Error("Original indisponível.");
  return withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${documentId}`}))`);
    const current = await requireManagedDocument(context, documentId, tx); if (current.versionId !== document.versionId || current.editorialStatus !== "HOMOLOGADO") throw new Error("A versão mudou durante a publicação.");
    const id = randomUUID(); const publicKey = randomUUID();
    await tx.execute(sql`INSERT INTO "TransparencyPublication"(id,"publicKey","collectionSlug",entity,year,title,"group","referencePeriod","documentKind","legalStage",source,status,"values",version,"order","fileUrl","filePathname",filename,"contentType",sha256,"publishedAt","createdAt","updatedAt") VALUES(${id},${publicKey},${input.collectionSlug},${input.entity},${input.year},${input.title},${input.group},${input.referencePeriod},${input.documentKind},${input.legalStage},'DOCUMENTOS','PUBLISHED',${JSON.stringify({ origin: "GED", documentId, versionId: document.versionId })}::jsonb,${document.versionNumber},0,${document.fileUrl},${stored.blob.pathname},${document.filename},${document.mimeType},${document.hashSha256},now(),now(),now())`);
    await tx.execute(sql`INSERT INTO "GedPublicationLink"("publicationId","documentId","versionId") VALUES(${id},${documentId},${document.versionId})`);
    await gedActivity(tx, context, documentId, "PUBLICATION", { id, versionId: document.versionId });
    return { id, publicKey };
  });
}

/** Called only after the source module authorizes its record. No generic backfill. */
export async function linkGedSource(context: AppContext, input: { documentId: string; module: string; sourceId: string }, authorizeSource: (context: AppContext, sourceId: string) => Promise<void>) {
  await requireGedObject(context, "document", input.documentId, "edit");
  await authorizeSource(context, input.sourceId);
  await (context.database ?? db).execute(sql`INSERT INTO "GedIntegrationLink"("documentId",module,"sourceId") VALUES(${input.documentId},${input.module},${input.sourceId}) ON CONFLICT DO NOTHING`);
  await gedActivity(context.database ?? db, context, input.documentId, "SOURCE_LINK", { module: input.module, sourceId: input.sourceId });
}
