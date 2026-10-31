import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { getGedContext } from "@/lib/documents/ged-access";
import { completeGedUpload, gedUploadSchema, prepareGedUpload, saveGedTemplate } from "@/lib/documents/ged-service";
import { GED_MAX_BYTES } from "@/lib/documents/ged-storage";
import { gedMimeTypes } from "@/lib/documents/ged-policy";
import { AccessError } from "@/lib/platform/access-error";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("Origem inválida.");
      const context = await getGedContext("models");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 3 * 1024 * 1024) throw new Error("Importe DOCX de até 3 MiB.");
      const result = await saveGedTemplate(context, String(form.get("name") || file.name), "", file, String(form.get("templateKey") || "") || undefined);
      return Response.json({ error: null, result });
    }
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({ body, request,
      onBeforeGenerateToken: async (pathname, payload) => {
        if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("Origem inválida.");
        const context = await getGedContext();
        const input = gedUploadSchema.parse(JSON.parse(payload || "{}"));
        const prepared = await prepareGedUpload(context, input);
        if (prepared.pathname !== pathname || prepared.status === "DONE") throw new Error("Destino ou estado de upload inválido.");
        return { allowedContentTypes: Object.values(gedMimeTypes), maximumSizeInBytes: GED_MAX_BYTES, addRandomSuffix: false, allowOverwrite: false,
          tokenPayload: JSON.stringify({ id: prepared.id, ownerId: context.user.id, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const input = z.object({ id: z.uuid(), ownerId: z.string().min(1), pathname: z.string().min(1) }).parse(JSON.parse(tokenPayload || "{}"));
        await completeGedUpload(input.id, input.ownerId, blob.pathname, blob.url);
      },
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error && !/query|constraint|postgres|https?:\/\//i.test(error.message) ? error.message : "Não foi possível enviar o arquivo.";
    return Response.json({ error: message }, { status: error instanceof AccessError ? error.status : 400 });
  }
}
