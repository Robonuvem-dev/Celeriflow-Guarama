import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { fleetControlReferences } from "@/lib/frotas/control-queries";

export async function GET(request: Request) {
  try { const context = await getTenantContextForModule("FROTAS"), query = new URL(request.url).searchParams; return Response.json({ options: await fleetControlReferences(context, query.get("kind") || "", query.get("q") || "", query.get("unitId") || "") }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível consultar referências da Frota." }, { status: error instanceof AccessError ? error.status : 500 }); }
}
