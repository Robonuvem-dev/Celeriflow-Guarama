import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { annualComparisonFilters, readAnnualTaxComparison } from "@/lib/tributacao/annual-comparison";

export async function GET(request: Request) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
    const filters = annualComparisonFilters.parse(Object.fromEntries(new URL(request.url).searchParams));
    const report = await readAnnualTaxComparison(prisma, { allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, filters);
    const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-]/, "'$&").replaceAll('"', '""')}"`;
    const metric = filters.metric === "VENAL" ? "Venal" : "Líquido";
    const rows = [["Tributo", "Contribuinte", "Inscrição", `${metric} ${filters.firstYear}`, `${metric} ${filters.secondYear}`, "Diferença", "Variação percentual", "Pendências Decimal"], ...report.rows.map(row => [row.tax, row.taxpayer, row.registration, row.comparedFirst ?? "PENDENTE", row.comparedSecond ?? "PENDENTE", row.change?.difference, row.change?.percentage, row.first.pendingDecimal + row.second.pendingDecimal])];
    return new Response(`\uFEFF${rows.map(row => row.map(cell).join(";")).join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="comparativo-tributario-${filters.firstYear}-${filters.secondYear}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível exportar." }, { status: 400 }); }
}
