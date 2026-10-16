import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { readEsocialEvent } from "@/lib/sst/esocial-service";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "issueReports");
    const row = await readEsocialEvent(context, (await params).id);
    return Response.json({ ...row, homologated: false }, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="sst-esocial-preparation.json"` } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Preparação indisponível." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "no-store" } }); }
}
