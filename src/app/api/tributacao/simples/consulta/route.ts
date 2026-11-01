import { db } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { readSimplesDossier, simplesDossierCsv } from "@/lib/tributacao/simples-dossier";
import { exportSimpleTable, type SimpleTabularFormat } from "@/lib/reports/simple-tabular-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
    const query = new URL(request.url).searchParams;
    const dossier = await readSimplesDossier(context.database ?? db, query.get("taxpayerId") ?? "", Number(query.get("year")), query.get("recordType")?.trim());
    const format = query.get("format") ?? "json";
    if (!["json", "csv", "pdf", "xlsx", "docx", "txt"].includes(format)) return Response.json({ error: "Formato inválido." }, { status: 400 });
    const exported = format === "json" ? { body: JSON.stringify(dossier, null, 2), contentType: "application/json; charset=utf-8", extension: "json" }
      : format === "csv" ? { body: simplesDossierCsv(dossier.records), contentType: "text/csv; charset=utf-8", extension: "csv" }
      : await exportSimpleTable({ title: `Simples Nacional — ${dossier.taxpayer.company?.corporateName ?? dossier.taxpayer.taxpayer.id} — ${dossier.year}`, columns: ["Competência", "Tipo", "Receita nacional", "Serviços declarados", "ISS municipal", "Confirmado", "Atividade", "Alíquota", "Situação"], rows: dossier.records.map(row => [row.competence, row.recordType, row.nationalRevenueDecimal.toString(), row.declaredServiceDecimal.toString(), row.municipalIssDecimal.toString(), row.confirmedPaymentDecimal.toString(), row.activityCode, row.rate?.toString() ?? null, row.status]) }, format as SimpleTabularFormat);
    return new Response(typeof exported.body === "string" ? exported.body : new Uint8Array(exported.body), { headers: { "Content-Type": exported.contentType, "Content-Disposition": `attachment; filename="simples-${dossier.year}.${exported.extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "Consulta indisponível. Verifique o acesso e os filtros informados." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
}
