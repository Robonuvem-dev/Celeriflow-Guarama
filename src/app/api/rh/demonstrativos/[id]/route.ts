import { NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getPayrollStatement, renderPayrollStatementPdf } from "@/lib/rh/statement-service";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { hrPayrollRuns, hrPayrollStatements } from "@/db/schema/personnel-workforce";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const id = (await params).id;
  const executor = context.database ?? db;
  const [row] = await executor.select({ payrollId: hrPayrollRuns.payrollId }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).where(eq(hrPayrollStatements.id, id)).limit(1);
  if (!row) throw new Error("Demonstrativo indisponível.");
  await assertPayrollBudgetScope(context, row.payrollId);
  const statement = await getPayrollStatement(executor, id);
  return new NextResponse(new Uint8Array(await renderPayrollStatementPdf(statement)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="demonstrativo-${statement.id}.pdf"`, "Cache-Control": "private, no-store" } });
}
