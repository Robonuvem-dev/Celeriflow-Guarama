import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { downloadItbiProcessAttachment } from "@/lib/tributacao/itbi-portal-storage";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const { id } = await params; return await downloadItbiProcessAttachment(prisma, { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, new URL(request.url).searchParams.get("declarationId") ?? "", id); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Anexo indisponível." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
