import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { renderConfiguredItbiDocument } from "@/lib/tributacao/itbi-document-models";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const { id } = await params;
    const bytes = await renderConfiguredItbiDocument(taxActionConnection(context), { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, id);
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="declaracao-itbi.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Declaração indisponível." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
}
