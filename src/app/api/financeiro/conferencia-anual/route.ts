import { AccessError, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { resolveFinancialReportScope } from "@/lib/financeiro/report-scope";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reportSchema = z.object({ financialYearId: z.string(), governmentEntityId: z.string(), year: z.number(), generatedAt: z.string(), issues: z.array(z.object({ code: z.string(), severity: z.string(), entityType: z.string(), entityId: z.string(), budgetUnitId: z.string().nullable(), message: z.string() })) });

export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
    const reportId = new URL(request.url).searchParams.get("reportId") ?? "";
    const record = await context.prisma.financialAuditLog.findUniqueOrThrow({ where: { id: reportId } });
    if (record.action !== "ANNUAL_CONSISTENCY_REPORT" || record.entityType !== "AnnualConsistencyReport" || !record.financialYearId) throw new Error("Emissão de conferência anual não encontrada.");
    const scope = await resolveFinancialReportScope(context.prisma, record.financialYearId, { budgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
    if (!scope.fullEntity || !scope.governmentEntityId) throw new Error("Relatório anual exige autorização para todas as UGs do ente.");
    const report = reportSchema.parse(record.payload);
    if (report.financialYearId !== record.financialYearId || report.governmentEntityId !== scope.governmentEntityId) throw new Error("Memória do relatório diverge do exercício autorizado.");
    const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const rows = [["Emissão", "Exercício", "Data", "Nível", "Código", "Entidade", "Registro", "UG", "Descrição"], ...report.issues.map(issue => [record.id, String(report.year), report.generatedAt, issue.severity, issue.code, issue.entityType, issue.entityId, issue.budgetUnitId ?? "", issue.message])];
    if (!report.issues.length) rows.push([record.id, String(report.year), report.generatedAt, "OK", "", "", "", "", "Nenhuma inconsistência identificada nas verificações desta emissão."]);
    return new Response("\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="conferencia-anual.csv"', "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível emitir o relatório." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "private, no-store" } }); }
}
