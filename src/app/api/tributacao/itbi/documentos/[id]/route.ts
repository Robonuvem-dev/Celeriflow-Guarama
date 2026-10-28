import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { downloadItbiProcessAttachment } from "@/lib/tributacao/itbi-portal-storage";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const { id } = await params; return await downloadItbiProcessAttachment(taxActionConnection(context), { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, new URL(request.url).searchParams.get("declarationId") ?? "", id); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Anexo indisponível." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
