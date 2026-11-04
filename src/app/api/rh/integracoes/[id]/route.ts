import { NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hrIntegrationEvents, hrPayrollStatements } from "@/db/schema/personnel-workforce";
import { requirePayrollRun } from "@/db/repositories/personnel/workforce";
import { assertIntegrationEventAccess } from "@/lib/rh/integration-event-access";
import { integrationEventWhere } from "@/lib/rh/integration-event-scope";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const database = context.database ?? db;
  const [event] = await database.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.id, (await params).id), integrationEventWhere(context.user, hrIntegrationEvents.payload))).limit(1);
  if (!event) throw new Error("Origem da integração não encontrada.");
  await assertIntegrationEventAccess(database, context, event.payload);
  const payload = event.payload as { runId?: string };
  let run = null;
  if (payload.runId) {
    const source = await requirePayrollRun(database, payload.runId);
    await assertPayrollBudgetScope(context, source.payrollId);
    run = { ...source, statements: await database.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, payload.runId)).orderBy(asc(hrPayrollStatements.id)) };
  }
  return NextResponse.json({ artifactType: "ORIGEM_PARA_CONFERENCIA", officialFile: false, transmitted: false, event, run }, { headers: { "Content-Disposition": `attachment; filename="origem-rh-${event.id}.json"`, "Cache-Control": "private, no-store" } });
}
