import { AccessError, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readResourceAvailability } from "@/lib/financeiro/resource-availability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
    const params = new URL(request.url).searchParams;
    const report = await readResourceAvailability(context.prisma, { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { financialYearId: params.get("financialYearId") ?? "", governmentEntityId: params.get("governmentEntityId") ?? "", resourceSourceIds: params.getAll("resourceSourceIds") });
    const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const lines = [["Fonte", "Descrição", "Saldo disponível", "Empenhos a pagar", "RAP a pagar", "Extras a pagar", "Déficit/superávit"], ...report.rows.map(row => [row.sourceCode, row.sourceName, row.availableBalance, row.commitmentsPayable, row.carryForwardsPayable, row.extraPayables, row.deficitSurplus])];
    const csv = "\uFEFF" + lines.map(line => line.map(cell).join(";")).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="disponibilidade-fontes.csv"', "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível emitir o relatório." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "private, no-store" } }); }
}
