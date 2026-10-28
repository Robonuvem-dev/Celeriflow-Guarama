import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { tfdProcessReport } from "@/lib/saude/tfd-report-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports");
  const query = new URL(request.url).searchParams;
  const rows = await tfdProcessReport(context, Object.fromEntries(query.entries()));
  const columns = ["Processo", "Data", "Paciente", "Unidade solicitante", "Destino", "Profissional", "Procedimento", "Diagnóstico", "Versão", "Situação", "Autorização", "Benefícios autorizados", "Benefícios entregues"];
  const cell = (value: unknown) => { const text = String(value ?? ""); return `"${(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`; };
  const csv = `\uFEFF${[columns, ...rows.map(row => columns.map(column => row[column as keyof typeof row]))].map(row => row.map(cell).join(";")).join("\r\n")}\r\n`;
  await insertAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_TFD_REPORT", targetId: "processes" });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="processos-tfd.csv"', "Cache-Control": "private, no-store" } });
}
