import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { authorizeFleetAttachment, fleetAttachmentCallbackContext, fleetAttachmentOwners, fleetAttachmentPrefix, fleetAttachmentTypes, registerFleetAttachment, validateFleetAttachmentName } from "@/lib/frotas/control-attachments";
import { checkRateLimit } from "@/lib/platform/rate-limit";

export const runtime = "nodejs";
const payload = z.object({ unitId: z.string().min(1), ownerType: z.enum(fleetAttachmentOwners), ownerId: z.string().min(1), filename: z.string().min(1).max(250), size: z.number().int().positive().max(20 * 1024 * 1024) }).strict();
export async function GET() {
  try { const context = await getTenantContextForModuleOperation("FROTAS", "create"); return Response.json({ prefix: fleetAttachmentPrefix(context.user.id) }); } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Upload não disponível." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.operation === "confirmar") {
      if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
      const context = await getTenantContextForModuleOperation("FROTAS", "create"), data = payload.parse(body.payload);
      const item = await registerFleetAttachment(context, data, z.url().parse(body.url)); return Response.json({ id: item.id, versionId: item.versionId });
    }
    return Response.json(await handleUpload({ body: body as HandleUploadBody, request, onBeforeGenerateToken: async (pathname, clientPayload) => {
      if (!isSameOriginRequest(request)) throw new Error("Origem inválida.");
      const context = await getTenantContextForModuleOperation("FROTAS", "create"), data = payload.parse(JSON.parse(clientPayload || "{}"));
      if (!checkRateLimit(`fleet-upload:${context.user.id}`).allowed) throw new Error("Aguarde antes de enviar novamente.");
      validateFleetAttachmentName(data.filename, data.size); await authorizeFleetAttachment(context, data);
      const prefix = fleetAttachmentPrefix(context.user.id);
      if (!pathname.startsWith(prefix) || !/^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$/.test(pathname.slice(prefix.length))) throw new Error("Destino não autorizado.");
      return { allowedContentTypes: fleetAttachmentTypes, maximumSizeInBytes: 20 * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({ ...data, actorId: context.user.id }) };
    }, onUploadCompleted: async ({ blob, tokenPayload }) => { const data = payload.extend({ actorId: z.string().min(1) }).parse(JSON.parse(tokenPayload || "{}")); await registerFleetAttachment(await fleetAttachmentCallbackContext(data.actorId), data, blob.url); } }));
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Arquivo/registro não autorizado. Confira os dados e tente novamente." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
