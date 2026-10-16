import { NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const { prisma } = context;
  const event = await prisma.hrIntegrationEvent.findUniqueOrThrow({ where: { id: (await params).id } });
  const payload = event.payload as { runId?: string };
  if (payload.runId) {
    const source = await prisma.hrPayrollRun.findUniqueOrThrow({ where: { id: payload.runId }, select: { payrollId: true } });
    await assertPayrollBudgetScope(context, source.payrollId);
  }
  const run = payload.runId ? await prisma.hrPayrollRun.findUnique({ where: { id: payload.runId }, include: { statements: { orderBy: { id: "asc" } } } }) : null;
  return NextResponse.json({ artifactType: "ORIGEM_PARA_CONFERENCIA", officialFile: false, transmitted: false, event, run }, { headers: { "Content-Disposition": `attachment; filename="origem-rh-${event.id}.json"`, "Cache-Control": "private, no-store" } });
}
