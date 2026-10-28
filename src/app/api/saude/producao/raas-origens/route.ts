import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getHealthRaasSources } from "@/lib/saude/raas-source-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports");
  const dataset = await getHealthRaasSources(context, Object.fromEntries(new URL(request.url).searchParams.entries()));
  await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_RAAS_ORIGINS", targetId: dataset.period });
  return new Response(JSON.stringify(dataset, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="celeriflow-raas-origens-${dataset.period}.json"`, "Cache-Control": "private, no-store" } });
}
