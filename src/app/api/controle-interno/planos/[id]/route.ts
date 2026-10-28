import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { buildControlReport, renderControlReport } from "@/lib/c7/control-report";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db, databaseConnection } from "@/db/client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.object({ format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF"), noticeId: z.string().min(1).optional(), auditId: z.string().min(1).optional() }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
  const context = parsed.data.noticeId || parsed.data.auditId ? await getTenantContextForModule("ADMINISTRACAO") : await getTenantContextForModuleOperation("ADMINISTRACAO", "issueReports");
  try {
    const report = await buildControlReport(databaseConnection, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { planId: id, noticeId: parsed.data.noticeId, auditId: parsed.data.auditId });
    const output = await renderControlReport(report, parsed.data.format);
    await insertAuditEvent(db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "INTERNAL_CONTROL_PLAN", targetId: id });
    return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="controle-interno.${output.extension}"`, "Cache-Control": "private, no-store", "X-Dataset-SHA256": report.hash } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Relatório indisponível." }, { status: 400 }); }
}
