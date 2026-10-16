import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readFrozenControlReportBytes } from "@/lib/c7/circumstantiated-report";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { prisma, user } = await getTenantContextForModuleOperation("ADMINISTRACAO", "issueReports");
  const { id } = await params;
  const final = await prisma.internalControlEvent.findUnique({ where: { id }, select: { plan: { select: { budgetUnitId: true, ownerId: true } } } });
  if (!final?.plan.budgetUnitId || final.plan.ownerId !== user.id || (!isSystemAdministrator(user) && !user.allowedBudgetUnitIds.includes(final.plan.budgetUnitId))) return Response.json({ error: "Relatório indisponível." }, { status: 404 });
  const file = await readFrozenControlReportBytes(prisma, id);
  if (new URL(_request.url).searchParams.get("format") === "SIGNATURE") {
    if (!file.signature) return Response.json({ error: "Documento ainda não assinado com A1." }, { status: 404 });
    return Response.json(file.signature, { headers: { "Content-Disposition": `attachment; filename="controle-${id}-assinatura.json"`, "Cache-Control": "private, no-store" } });
  }
  return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="controle-${id}.pdf"`, "X-Content-SHA256": file.sha256, "Cache-Control": "private, no-store" } });
}
