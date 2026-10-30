import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getCentralReceipt } from "@/lib/signatures/central-service";
import { centralHttpError, centralNoStore } from "@/lib/signatures/central-http";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
    const receipt = await getCentralReceipt(context, (await params).id);
    return Response.json(receipt, { headers: { ...centralNoStore, "Content-Disposition": `attachment; filename="comprovante-${receipt.record.code}.json"` } });
  } catch (error) { return centralHttpError(error); }
}
