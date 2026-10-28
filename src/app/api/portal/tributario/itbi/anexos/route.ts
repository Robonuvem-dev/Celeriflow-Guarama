import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { db } from "@/db/client";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { validPortalUploadPath } from "@/lib/portal-cidadao/evidence-policy";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { assertPortalItbiAccess } from "@/lib/tributacao/itbi-process-channel";
import { itbiUploadPrefix, itbiUploadLimit, itbiUploadTypes, registerItbiPortalUpload } from "@/lib/tributacao/itbi-portal-storage";

export const runtime = "nodejs";
const payloadSchema = z.object({ declarationId: z.string().min(1), filename: z.string().trim().min(1).max(240) }).strict();
export async function GET(request: Request) {
  try { const account = await getCitizenApiAccount(); const id = new URL(request.url).searchParams.get("declarationId") ?? ""; await assertPortalItbiAccess(db, account.id, id); return Response.json({ prefix: itbiUploadPrefix(account.id, id), maximumSize: itbiUploadLimit }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return portalApiError(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.operation === "confirmar") {
      if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
      const account = await getCitizenApiAccount(); const input = payloadSchema.parse(body.payload);
      return Response.json(await registerItbiPortalUpload({ ...input, usuarioId: account.id, url: z.url().parse(body.url) }), { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json(await handleUpload({ body: body as HandleUploadBody, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!isSameOriginRequest(request)) throw new Error("Origem inválida.");
        const account = await getCitizenApiAccount(); const input = payloadSchema.parse(JSON.parse(clientPayload || "{}"));
        await assertPortalItbiAccess(db, account.id, input.declarationId);
        if (!checkRateLimit(`itbi-upload:${account.id}`).allowed) throw new Error("Aguarde antes de enviar novamente.");
        if (!validPortalUploadPath(pathname, itbiUploadPrefix(account.id, input.declarationId))) throw new Error("Destino de upload inválido.");
        return { allowedContentTypes: itbiUploadTypes, maximumSizeInBytes: itbiUploadLimit, addRandomSuffix: true, tokenPayload: JSON.stringify({ ...input, usuarioId: account.id }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => { const payload = payloadSchema.extend({ usuarioId: z.string().min(1) }).parse(JSON.parse(tokenPayload || "{}")); await registerItbiPortalUpload({ ...payload, url: blob.url }); },
    }));
  } catch (error) { return portalApiError(error); }
}
