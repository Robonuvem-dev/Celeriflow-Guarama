import { eq } from "drizzle-orm";
import type { StoredReportTemplate } from "@/lib/contracts/report-template";
import type { ReportTemplatePresentation } from "@/lib/reports/report-template";
import { auditEventTypes } from "@/lib/contracts/audit";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { reportTemplates } from "../../schema/report-template";
import { insertAuditEvent } from "./audit";

export async function findReportTemplate(db: DatabaseExecutor, scope: string): Promise<StoredReportTemplate | null> {
  const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.scope, scope)).limit(1);
  return template ?? null;
}

export async function saveReportTemplateVersion(tx: DatabaseTransaction, scope: string, template: ReportTemplatePresentation, actorId: string): Promise<void> {
  await tx.insert(reportTemplates).values({ scope, ...template }).onConflictDoUpdate({ target: reportTemplates.scope, set: template });
  await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "REPORT_TEMPLATE", targetId: scope });
}
