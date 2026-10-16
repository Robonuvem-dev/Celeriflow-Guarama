import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError, canPerformModuleOperation, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { controlWorkforceStatisticsReport, readControlWorkforceStatistics, workforceStatisticsInput } from "@/lib/c7/workforce-statistics";
import { renderHrReport } from "@/lib/rh/report-service";

export async function GET(request: NextRequest) {
  const { prisma, user } = await getTenantContextForModuleOperation("ADMINISTRACAO", "issueReports");
  if (!canPerformModuleOperation(user, "RH", "issueReports") || !await prisma.configuracaoModulo.count({ where: { codigo: "RH", ativo: true } })) throw new AccessError("Exportação das estatísticas exige emissão de relatórios do RH ativo.", 403);
  const values = Object.fromEntries(request.nextUrl.searchParams);
  const input = workforceStatisticsInput.safeParse(values);
  const format = z.enum(["CSV", "XLSX", "PDF"]).default("PDF").safeParse(values.format);
  if (!input.success || !format.success) return NextResponse.json({ error: "Filtros ou formato inválidos." }, { status: 400 });
  const data = await readControlWorkforceStatistics(prisma, { usuarioId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input.data);
  const output = await renderHrReport(controlWorkforceStatisticsReport(data), format.data);
  return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="controle-estatisticas-rh-${data.referenceDate}.${output.extension}"`, "Cache-Control": "private, no-store" } });
}
