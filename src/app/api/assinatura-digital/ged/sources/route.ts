import { z } from "zod";
import { getGedContext } from "@/lib/documents/ged-access";
import { resolveGedSource } from "@/lib/documents/ged-source-adapters";
import { ingestGedSource, queryGedSource } from "@/lib/documents/ged-source-ingress";
import { AccessError } from "@/lib/platform/access-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const jurisdiction = z.enum(["EXECUTIVE", "LEGISLATIVE"]).default("EXECUTIVE");
function failure(error: unknown) {
  return Response.json({ error: error instanceof Error && !/query|constraint|postgres|https?:\/\//i.test(error.message) ? error.message : "Não foi possível acessar a origem documental." }, { status: error instanceof AccessError ? error.status : 400 });
}
export async function GET(request: Request) {
  try {
    const context = await getGedContext(); const params = new URL(request.url).searchParams;
    const source = await resolveGedSource(context, params.get("module"), jurisdiction.parse(params.get("jurisdiction") || undefined));
    const result = params.get("id") ? await queryGedSource(context, source.adapter, params.get("id")!) : await source.list(params.get("text") ?? "", z.coerce.number().int().min(1).max(100000).parse(params.get("page") || 1));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AccessError("Origem não permitida.", 403);
    const context = await getGedContext("import");
    const text = await request.text(); if (text.length > 100000) throw new Error("Dados excedem o limite.");
    const input = z.object({ module: z.string(), jurisdiction, sourceId: z.string().min(1).max(150), classCode: z.string().min(1), indexValues: z.record(z.string(), z.unknown()).default({}), folderId: z.string().nullable().default(null) }).parse(JSON.parse(text));
    const source = await resolveGedSource(context, input.module, input.jurisdiction);
    const result = await ingestGedSource(context, source.adapter, input.sourceId, input);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
