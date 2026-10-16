import { NextRequest, NextResponse } from "next/server";
import { AccessError, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { costReportQuery } from "@/lib/financeiro/cost-query";
import { buildMunicipalCostReport, renderMunicipalCostReport } from "@/lib/financeiro/cost-report";
import { MunicipalCostError } from "@/lib/financeiro/cost-ledger";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function GET(request: NextRequest) {
  const input = costReportQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? "Filtros inválidos." }, { status: 400 });
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
    const report = await buildMunicipalCostReport(context.prisma, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input.data);
    const output = await renderMunicipalCostReport(report, input.data.format);
    await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.financialReportExport, targetType: "MUNICIPAL_COST_REPORT", targetId: input.data.movementId ?? input.data.yearId });
    return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="custos.${output.extension}"`, "Cache-Control": "private, no-store", "X-Dataset-SHA256": report.hash } });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof MunicipalCostError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Não foi possível emitir o relatório de custos." }, { status: 500 });
  }
}
