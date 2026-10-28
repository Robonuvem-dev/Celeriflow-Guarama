import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionTaxpayerReport } from "@/db/repositories/tax-actions/reports";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const database = taxActionConnection(context).db;
  const rows = await actionTaxpayerReport(database, q);
  const body = ["Tipo;Nome;Documento;Inscricao;Situacao;Empresas;Imoveis", ...rows.map((row) => [row.taxpayerType, row.company?.corporateName ?? row.person?.fullName, row.company?.cnpj ?? row.person?.cpf, row.municipalInsc, row.status, row._count.economicRegistrations, row._count.realEstates].map(csv).join(";"))].join("\r\n");
  await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "TAXPAYER_REPORT", targetId: `filter:${q || "all"}` });
  return new Response(`\uFEFF${body}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=cadastro-fiscal.csv" } });
}
