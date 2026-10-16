import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { emitClosureDocument } from "@/lib/sst/closure-document";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "issueReports");
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") === "FUNCTIONAL" ? "FUNCTIONAL" : "PPP";
    const result = await emitClosureDocument(context, kind, { budgetUnitId: params.get("budgetUnitId") || "", employeeId: params.get("employeeId") || "", from: params.get("from") || "", until: params.get("until") || "" });
    return new Response(new Uint8Array(result.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sst-${kind.toLowerCase()}-${result.id}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Emissão indisponível. Confira o período, as fontes e o limite de 5.000 registros." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "no-store" } }); }
}
