import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import { listPublishedPlanningReports, readPublishedPlanningReport } from "@/db/repositories/transparency/planning-publications";
import { AccessError } from "@/lib/platform/tenant-context";
import { getFile } from "@/lib/platform/blob";

export type PublicPlanningStorage = { get: (url: string) => Promise<Uint8Array | null> };
const storage: PublicPlanningStorage = {
  async get(url) {
    const file = await getFile(url);
    return file?.stream ? new Uint8Array(await new Response(file.stream).arrayBuffer()) : null;
  },
};

export async function listPlanningPublications(db: DatabaseExecutor, raw: unknown) {
  const input = z.object({ year: z.coerce.number().int().min(1900).max(2200).optional(), entity: z.string().max(200).optional(), page: z.coerce.number().int().positive().default(1) }).parse(raw);
  return listPublishedPlanningReports(db, input);
}

export async function readPlanningPublishedFile(db: DatabaseExecutor, publicKey: string, source: PublicPlanningStorage = storage) {
  const publication = await readPublishedPlanningReport(db, publicKey);
  if (!publication?.fileUrl || !publication.fileHash) throw new AccessError("Documento público não encontrado.", 404);
  const bytes = await source.get(publication.fileUrl);
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== publication.fileHash) throw new AccessError("Arquivo público indisponível ou integridade não confirmada.", 423);
  return { bytes, filename: publication.filename, contentType: publication.contentType, hash: publication.fileHash };
}

export async function publicPlanningPublicationResponse(db: DatabaseExecutor, publicKey: string, source?: PublicPlanningStorage) {
  try {
    const artifact = await readPlanningPublishedFile(db, publicKey, source);
    return new Response(new Uint8Array(artifact.bytes), { headers: { "Content-Type": artifact.contentType, "Content-Disposition": `attachment; filename="${artifact.filename}"`, "Cache-Control": "no-store", "X-Report-File-SHA256": artifact.hash, "X-Planning-Completeness": "REVIEW_COPY_NOT_STATUTORY" } });
  } catch (error) {
    return Response.json({ error: error instanceof AccessError ? error.message : "Documento público indisponível." }, { status: error instanceof AccessError ? error.status : 503 });
  }
}
