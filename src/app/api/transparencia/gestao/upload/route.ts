import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { publicationMetadataSchema,isTransparencyCollectionEnabled } from "@/lib/transparencia/publication-policy";
import {getTransparencySettings} from "@/lib/transparencia/presentation-settings";
import { publicDocumentTypes, publicationUploadLimit, publicationUploadPrefix, registerPublicationUpload } from "@/lib/transparencia/publication-storage";
import {isSameOriginRequest} from "@/lib/transparencia/request-origin";

const payloadSchema = z.object({ uploadId: z.uuid(), filename: z.string().min(1).max(250), metadata: publicationMetadataSchema });
export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({ body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "create");
        if (!isSameOriginRequest(request)) throw new Error("Origem inválida.");
        const payload = payloadSchema.parse(JSON.parse(clientPayload || "{}"));
        const settings=await getTransparencySettings(db);if(!isTransparencyCollectionEnabled(payload.metadata.collectionSlug,settings)||!settings.availableYears.includes(payload.metadata.year))throw new Error("Consulta ou exercício não configurado.");
        if (!pathname.startsWith(publicationUploadPrefix(context.user.id, payload.uploadId))) throw new Error("Destino de upload inválido.");
        return { allowedContentTypes: publicDocumentTypes, maximumSizeInBytes: publicationUploadLimit, addRandomSuffix: true, tokenPayload: JSON.stringify({ ...payload, userId: context.user.id }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = payloadSchema.extend({ userId: z.string().min(1) }).parse(JSON.parse(tokenPayload || "{}"));
        await registerPublicationUpload(db, { ...payload, url: blob.url, pathname: blob.pathname });
      },
    });
    return Response.json(result);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Upload não autorizado." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
