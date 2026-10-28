import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readFrozenControlReportBytes } from "@/lib/c7/circumstantiated-report";
import { db } from "@/db/client";
import { getControlEvent, getControlPlan } from "@/db/repositories/internal-control/records";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getTenantContextForModuleOperation("ADMINISTRACAO", "issueReports");
  const { id } = await params;
  const event = await getControlEvent(db, id);
  const final = event ? { plan: await getControlPlan(db, event.planId) } : null;
  if (!final?.plan?.budgetUnitId || final.plan.ownerId !== user.id || (!isSystemAdministrator(user) && !user.allowedBudgetUnitIds.includes(final.plan.budgetUnitId))) return Response.json({ error: "Relatório indisponível." }, { status: 404 });
  const file = await readFrozenControlReportBytes(db, id);
  if (new URL(_request.url).searchParams.get("format") === "SIGNATURE") {
    if (!file.signature) return Response.json({ error: "Documento ainda não assinado com A1." }, { status: 404 });
    return Response.json(file.signature, { headers: { "Content-Disposition": `attachment; filename="controle-${id}-assinatura.json"`, "Cache-Control": "private, no-store" } });
  }
  return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="controle-${id}.pdf"`, "X-Content-SHA256": file.sha256, "Cache-Control": "private, no-store" } });
}
