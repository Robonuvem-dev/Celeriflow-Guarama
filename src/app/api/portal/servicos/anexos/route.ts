import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { resolvePortalEvidence, registerPortalEvidence, portalEvidenceLimit, portalEvidencePrefix, portalEvidenceTypes } from "@/lib/portal-cidadao/evidence-storage";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { validPortalUploadPath } from "@/lib/portal-cidadao/evidence-policy";

export const runtime = "nodejs";
const payloadSchema = z.object({ serviceId: z.string().min(1), code: z.string().min(1), requestId: z.string().default(""), filename: z.string().min(1).max(250) }).strict();

export async function GET(request: Request) {
  try {
    const account = await getCitizenApiAccount(), query = new URL(request.url).searchParams;
    await resolvePortalEvidence(account.id, query.get("serviceId") || "", query.get("code") || "", query.get("requestId") || "");
    return Response.json({ prefix: portalEvidencePrefix(account.id), maximumSize: portalEvidenceLimit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.operation === "confirmar") {
      if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
      const account = await getCitizenApiAccount(), input = payloadSchema.parse(body.payload);
      return Response.json(await registerPortalEvidence({ ...input, ownerId: account.id, url: z.url().parse(body.url) }), { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json(await handleUpload({ body: body as HandleUploadBody, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!isSameOriginRequest(request)) throw new Error("Origem inválida.");
        const account = await getCitizenApiAccount();
        if (!checkRateLimit(`portal-upload:${account.id}`).allowed) throw new Error("Aguarde antes de enviar novamente.");
        const payload = payloadSchema.parse(JSON.parse(clientPayload || "{}"));
        await resolvePortalEvidence(account.id, payload.serviceId, payload.code, payload.requestId);
        if (!validPortalUploadPath(pathname, portalEvidencePrefix(account.id))) throw new Error("Destino de upload inválido.");
        return { allowedContentTypes: portalEvidenceTypes, maximumSizeInBytes: portalEvidenceLimit, addRandomSuffix: true, tokenPayload: JSON.stringify({ ...payload, ownerId: account.id }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = payloadSchema.extend({ ownerId: z.string().min(1) }).parse(JSON.parse(tokenPayload || "{}"));
        await registerPortalEvidence({ ...payload, url: blob.url });
      },
    }));
  } catch (error) { return portalApiError(error); }
}
