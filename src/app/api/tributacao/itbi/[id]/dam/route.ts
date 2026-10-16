import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { renderItbiDamPdf } from "@/lib/tributacao/itbi-dam-pdf";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const { id } = await params;
    const bytes = await renderItbiDamPdf(prisma, { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, id);
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="dam-itbi.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Guia indisponível." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
}
