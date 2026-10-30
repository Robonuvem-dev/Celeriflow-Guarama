import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadCentralFile } from "@/lib/signatures/central-service";
import { centralHttpError, centralNoStore } from "@/lib/signatures/central-http";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
    const file = await downloadCentralFile(context, (await params).id);
    return new Response(new Uint8Array(file.bytes), { headers: { ...centralNoStore, "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${file.filename}"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return centralHttpError(error); }
}
