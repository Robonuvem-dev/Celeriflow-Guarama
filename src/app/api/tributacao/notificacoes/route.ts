import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { renderDebtNoticeOutput } from "@/lib/tributacao/debt-notice-output";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const params = new URL(request.url).searchParams; const format = params.get("formato");
    const output = await renderDebtNoticeOutput(taxActionConnection(context).db, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, { noticeId: params.get("id") || undefined, batchId: params.get("lote") || undefined, format: format === "txt" ? "TXT" : format === "xml" ? "XML" : "PDF" });
    return new Response(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="notificacoes.${output.extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Documento indisponível." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
