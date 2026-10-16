import { NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getPayrollStatement, renderPayrollStatementPdf } from "@/lib/rh/statement-service";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const id = (await params).id;
  const row = await context.prisma.hrPayrollStatement.findUniqueOrThrow({ where: { id }, select: { run: { select: { payrollId: true } } } });
  await assertPayrollBudgetScope(context, row.run.payrollId);
  const statement = await getPayrollStatement(context.prisma, id);
  return new NextResponse(new Uint8Array(await renderPayrollStatementPdf(statement)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="demonstrativo-${statement.id}.pdf"`, "Cache-Control": "private, no-store" } });
}
