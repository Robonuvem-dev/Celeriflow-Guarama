import { NextRequest } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { buildSocialReport } from "@/db/repositories/social/reports";
import { renderSocialReport } from "@/lib/social/report-renderer";
import { db } from "@/db/client";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "issueReports");
    const query = Object.fromEntries(request.nextUrl.searchParams);
    const format = query.format === "xlsx" ? "xlsx" : query.format === "csv" ? "csv" : "pdf";
    const report = await buildSocialReport(context.database ?? db, await resolveSocialAccess(context), query);
    const rendered = await renderSocialReport(report, format);
    await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SOCIAL_REPORT", targetId: `${query.kind}:${query.from}:${query.to}` });
    return new Response(new Uint8Array(rendered.bytes), { headers: { "Content-Type": rendered.contentType, "Content-Disposition": `attachment; filename="social-${query.kind || "dashboard"}.${format}"`, "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Não foi possível emitir. Confira permissão e filtros." }, { status: 400 }); }
}
