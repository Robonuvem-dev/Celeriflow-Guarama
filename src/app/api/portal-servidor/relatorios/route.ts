import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { buildOwnPersonalReport, personalReportQuerySchema } from "@/lib/portal-servidor/personal-reports";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const values = Object.fromEntries(request.nextUrl.searchParams);
    if (values.contractId === "") delete values.contractId;
    if (values.totalsPolicyId === "") delete values.totalsPolicyId;
    const input = personalReportQuerySchema.parse(values);
    const report = await buildOwnPersonalReport(access.context, input);
    const file = await renderHrReport(report, input.format);
    await writeAuditEvent(access.context.database ?? db, {
      actorUsuarioId: access.context.user.id,
      eventType: auditEventTypes.reportIssued,
      targetType: "EMPLOYEE_PERSONAL_REPORT",
      targetId: access.employee.id,
    });
    return new NextResponse(new Uint8Array(file.bytes), { headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${input.kind.toLowerCase()}-${input.from}-${input.until}.${file.extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof AccessError ? error.message : error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" · ") : "Não foi possível emitir o relatório pessoal.";
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
