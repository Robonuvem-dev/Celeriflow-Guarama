import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { renderItbiProcessPdf } from "@/lib/tributacao/itbi-process-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const { id } = await params;
    const kind = new URL(request.url).searchParams.get("tipo") === "quitacao" ? "SETTLEMENT" : "PROCESS";
    const bytes = await renderItbiProcessPdf(prisma, { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, id, kind);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="itbi-${kind === "SETTLEMENT" ? "quitacao" : "processo"}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Documento indisponível." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
}
