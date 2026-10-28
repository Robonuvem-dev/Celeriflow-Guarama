import "server-only";
import { createHash } from "node:crypto";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { AccessError } from "@/lib/platform/tenant-context";
import { getPlanningContext } from "./access";
import type { PlanningJurisdiction } from "./policy";
import { readPlanningDocument } from "./documents";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { planningDatabase } from "./database";

export async function planningDocumentResponse(jurisdiction: PlanningJurisdiction, linkId: string) {
  try {
    const context = await getPlanningContext(jurisdiction);
    const link = await readPlanningDocument(context, linkId);
    const file = await getFile(link.version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo GED indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== link.version.hashSha256) throw new Error("O arquivo não corresponde ao hash da versão GED.");
    await insertAuditEvent(planningDatabase(context), { actorUsuarioId: context.user.id, eventType: "DOCUMENT_DOWNLOAD", targetType: "PLANNING_DOCUMENT", targetId: link.id });
    return new Response(bytes, { headers: { "Content-Type": file.blob?.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Document-SHA256": link.version.hashSha256 } });
  } catch (error) {
    return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível baixar a versão preservada do documento." }, { status: error instanceof AccessError ? error.status : 500 });
  }
}
