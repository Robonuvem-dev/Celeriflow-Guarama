import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { assertAccidentOperation } from "@/lib/sst/accident-service";
import { readLatestCatLayout, readCatLayoutRegistration } from "@/lib/sst/accident-layout-service";
import { renderOfficialCatPdf } from "@/lib/sst/accident-layout-pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("SST"), { id } = await params;
    assertAccidentOperation(context,"issueReports");
    const source = await readLatestCatLayout(context,id,true);
    if (!source) return Response.json({ error: "Preencha e salve o formulário INSS na ficha da CAT antes de imprimir." }, { status: 422 });
    const registration = await readCatLayoutRegistration(context,source.layout);
    const bytes = await renderOfficialCatPdf({ fields: source.layout.fields, medicalFields: source.medical?.fields || {}, internalId: id, revision: source.layout.version, requestHash: source.layout.requestHash, registration });
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="cat-inss-${id}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
    console.error("SST_CAT_INSS_PRINT_BLOCKED", { errorType: error instanceof Error ? error.name : "Unknown" });
    return Response.json({ error: "Emissão bloqueada. Confira o registro e a disponibilidade da versão oficial do formulário INSS." }, { status: 503 });
  }
}
