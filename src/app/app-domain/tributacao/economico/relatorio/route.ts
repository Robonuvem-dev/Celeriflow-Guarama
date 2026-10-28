import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionEconomicReport } from "@/db/repositories/tax-actions/reports";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const regime = url.searchParams.get("regime")?.trim();
  const database = taxActionConnection(context).db;
  const rows = await actionEconomicReport(database, status, regime);
  const body = ["Inscricao;Contribuinte;Documento;CNAE;Regime;Situacao;Inicio", ...rows.map((row) => [row.municipalInsc, row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName, row.taxpayer.company?.cnpj ?? row.taxpayer.person?.cpf, row.primaryCnae, row.taxRegime, row.status, row.startDate?.toLocaleDateString("pt-BR")].map(csv).join(";"))].join("\r\n");
  await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "ECONOMIC_REGISTRATION_REPORT", targetId: `filter:${status ?? "all"}:${regime ?? "all"}` });
  return new Response(`\uFEFF${body}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=cadastro-mercantil.csv" } });
}
