import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { appointmentReceipt } from "@/lib/saude/appointment-documents";
import { byteStream } from "@/lib/transparencia/export-files";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  return new Response(byteStream(await appointmentReceipt(context, id)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="comprovante-${id}.pdf"`, "Cache-Control": "no-store" } });
}
