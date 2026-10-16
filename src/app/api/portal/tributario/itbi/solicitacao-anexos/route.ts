import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { validPortalUploadPath } from "@/lib/portal-cidadao/evidence-policy";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { assertOnlineItbiDraftAccess } from "@/lib/tributacao/itbi-online";
import { itbiUploadLimit, itbiUploadTypes } from "@/lib/tributacao/itbi-portal-storage";
import { itbiDraftUploadSchema, itbiDraftUploadPrefix, registerOnlineItbiDraftUpload } from "@/lib/tributacao/itbi-draft-storage";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const account = await getCitizenApiAccount(); const input = itbiDraftUploadSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await assertOnlineItbiDraftAccess(prisma, account.id, input);
    return Response.json({ prefix: itbiDraftUploadPrefix(account.id, input.requestKey), maximumSize: itbiUploadLimit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.operation === "confirmar") {
      if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
      const account = await getCitizenApiAccount(); const input = itbiDraftUploadSchema.parse(body.payload);
      return Response.json(await registerOnlineItbiDraftUpload(prisma, account.id, { ...input, url: z.url().parse(body.url) }), { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json(await handleUpload({ body: body as HandleUploadBody, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!isSameOriginRequest(request)) throw new Error("Origem inválida.");
        const account = await getCitizenApiAccount(); const input = itbiDraftUploadSchema.parse(JSON.parse(clientPayload || "{}"));
        await assertOnlineItbiDraftAccess(prisma, account.id, input);
        if (!checkRateLimit(`itbi-draft-upload:${account.id}`).allowed) throw new Error("Aguarde antes de enviar novamente.");
        if (!validPortalUploadPath(pathname, itbiDraftUploadPrefix(account.id, input.requestKey))) throw new Error("Destino de upload inválido.");
        return { allowedContentTypes: itbiUploadTypes, maximumSizeInBytes: itbiUploadLimit, addRandomSuffix: true, tokenPayload: JSON.stringify({ ...input, usuarioId: account.id }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => { const { usuarioId, ...input } = itbiDraftUploadSchema.extend({ usuarioId: z.string().min(1) }).parse(JSON.parse(tokenPayload || "{}")); await registerOnlineItbiDraftUpload(prisma, usuarioId, { ...input, url: blob.url }); },
    }));
  } catch (error) { return portalApiError(error); }
}
