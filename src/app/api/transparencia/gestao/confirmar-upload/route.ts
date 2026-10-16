import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { publicationMetadataSchema } from "@/lib/transparencia/publication-policy";
import { registerPublicationUpload } from "@/lib/transparencia/publication-storage";
import {isSameOriginRequest} from "@/lib/transparencia/request-origin";

export async function POST(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "create");
    if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const data = z.object({ uploadId: z.uuid(), filename: z.string().min(1).max(250), url: z.url(), pathname: z.string().min(1).max(1000), metadata: publicationMetadataSchema }).parse(await request.json());
    const entry = await registerPublicationUpload(context.prisma, { ...data, userId: context.user.id });
    return Response.json({ id: entry.id, status: entry.status });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível confirmar o arquivo." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
