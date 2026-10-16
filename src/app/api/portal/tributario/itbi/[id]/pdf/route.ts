import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { renderItbiProcessPdf } from "@/lib/tributacao/itbi-process-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCitizenApiAccount(); const { id } = await params;
    const kind = new URL(request.url).searchParams.get("tipo") === "quitacao" ? "SETTLEMENT" : "PROCESS";
    const bytes = await renderItbiProcessPdf(prisma, { usuarioId: account.id }, id, kind);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="itbi-${kind === "SETTLEMENT" ? "quitacao" : "processo"}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
