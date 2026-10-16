import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { buildObligationHistory, obligationHistoryInputSchema } from "@/lib/rh/obligation-history";

export async function GET(request: NextRequest) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const parsed = obligationHistoryInputSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Informe ano válido e escopo DEMONSTRACAO, HOMOLOGACAO ou PRODUCAO." }, { status: 400 });
  const output = await buildObligationHistory(context.prisma, parsed.data, accessiblePayrollWhere(context.user));
  return new NextResponse(JSON.stringify(output, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="rh-obrigacoes-historico-${parsed.data.year}-${parsed.data.scope.toLowerCase()}.json"`, "Cache-Control": "private, no-store" } });
}
