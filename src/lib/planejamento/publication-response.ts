import type { PrismaClient } from "@prisma/client";
import { AccessError } from "@/lib/platform/tenant-context";
import { readPlanningPublishedFile, type PlanningPublicationStorage } from "./publication";

export async function publicPlanningPublicationResponse(db: PrismaClient, publicKey: string, storage?: PlanningPublicationStorage) {
  try {
    const artifact = await readPlanningPublishedFile(db, publicKey, storage);
    return new Response(new Uint8Array(artifact.bytes), { headers: { "Content-Type": artifact.contentType, "Content-Disposition": `attachment; filename="${artifact.filename}"`, "Cache-Control": "no-store", "X-Report-File-SHA256": artifact.hash, "X-Planning-Completeness": "REVIEW_COPY_NOT_STATUTORY" } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Documento público indisponível." }, { status: error instanceof AccessError ? error.status : 503 }); }
}
