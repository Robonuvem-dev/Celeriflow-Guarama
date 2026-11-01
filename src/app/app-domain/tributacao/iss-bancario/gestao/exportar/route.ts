import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { exportSimpleTable, type SimpleTabularFormat } from "@/lib/reports/simple-tabular-export";
import { readDesifManagement, type DesifReportFilter } from "@/lib/tributacao/desif-requirements";
export async function GET(request: Request) {
  const context = await getTenantContextForModule("TRIBUTACAO"), database = context.database ?? db;
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "pdf";
  if (!["pdf", "xlsx", "docx", "txt", "csv"].includes(format)) return new Response("Formato indisponível.", { status: 400 });
  const type = params.get("report") ?? "declaracoes";
  if (!["declaracoes", "autos", "iss", "contas", "omissos", "debitos"].includes(type)) return new Response("Relatório indisponível.", { status: 400 });
  const filter: DesifReportFilter = Object.fromEntries(["institution", "module", "start", "end", "status", "number", "year"].map(key => [key, params.get(key) ?? ""]));
  let columns: string[], rows: (string | number | null)[][];
  if (type === "omissos") {
    const year = z.coerce.number().int().min(1900).max(new Date().getFullYear()).parse(filter.year || new Date().getFullYear());
    const result = await database.execute<{ institution: string; cnpj: string; competence: string }>(sql`SELECT i.name AS institution,i."baseCnpj" AS cnpj,to_char(m.month,'YYYY-MM') AS competence FROM "DesifFinancialInstitution" i CROSS JOIN generate_series(make_date(${year},1,1),LEAST(make_date(${year},12,1),date_trunc('month',CURRENT_DATE)),INTERVAL '1 month') AS m(month) WHERE i.status='ATIVA' AND i."validFrom"<m.month+INTERVAL '1 month' AND (i."validUntil" IS NULL OR i."validUntil">=m.month) AND (${filter.institution || ""}='' OR i.id=${filter.institution || ""}) AND NOT EXISTS (SELECT 1 FROM "DesifImportBatch" b WHERE b."institutionId"=i.id AND b.competence=to_char(m.month,'YYYY-MM') AND b.status='PROCESSADO' AND b."moduleType" IN ('APURACAO','APURACAO_BALANCETE_TARIFAS')) ORDER BY i.name,m.month`);
    columns = ["Instituição cadastrada vigente", "CNPJ base", "Competência sem apuração mensal processada"];
    rows = result.rows.map(row => [row.institution, row.cnpj, row.competence]);
  } else if (type === "debitos") {
    const result = await database.execute<{ institution: string; competence: string; assessmentId: string; status: string; amount: string; guideNumber: string | null }>(sql`SELECT i.name AS institution,d.competence,t.id AS "assessmentId",t.status,COALESCE(t."finalValueDecimal",t."originalValueDecimal",t."originalValue"::numeric)::text AS amount,g."guideNumber" FROM "DesifAssessment" d JOIN "DesifAgency" a ON a.id=d."agencyId" JOIN "DesifFinancialInstitution" i ON i.id=a."institutionId" JOIN "TaxAssessment" t ON t.id=d."taxAssessmentId" LEFT JOIN "TaxGuide" g ON g.id=d."guideId" WHERE (${filter.institution || ""}='' OR i.id=${filter.institution || ""}) AND (${filter.year || ""}='' OR left(d.competence,4)=${filter.year || ""}) ORDER BY i.name,d.competence`);
    columns = ["Instituição", "Competência", "Lançamento tributário", "Situação", "Valor lançado", "Guia"];
    rows = result.rows.map(row => [row.institution, row.competence, row.assessmentId, row.status, row.amount, row.guideNumber]);
  } else if (type === "iss" || type === "contas") {
    const start = filter.start ? z.iso.date().parse(filter.start) : "";
    const end = filter.end ? z.iso.date().parse(filter.end) : "";
    const minimum = z.coerce.number().finite().nonnegative().parse(params.get("minimum") ?? 0);
    const maximum = params.has("maximum") && params.get("maximum") !== "" ? z.coerce.number().finite().nonnegative().parse(params.get("maximum")) : null;
    const result = await database.execute<{ institution: string; competence: string; account: string; subtitle: string; serviceItem: string | null; revenue: string; base: string; rate: string; tax: string; due: string }>(sql`SELECT n.name AS institution,a.competence,p.code AS account,s.code AS subtitle,COALESCE(s."serviceItem",p."serviceItem") AS "serviceItem",a."revenueDecimal"::text AS revenue,a."taxableBaseDecimal"::text AS base,a.rate::text,a."grossTaxDecimal"::text AS tax,a."taxDueDecimal"::text AS due FROM "DesifAssessment" a JOIN "DesifImportBatch" b ON b.id=a."importBatchId" JOIN "DesifAgency" g ON g.id=a."agencyId" JOIN "DesifFinancialInstitution" n ON n.id=g."institutionId" JOIN "DesifSubtitle" s ON s.id=a."subtitleId" JOIN "DesifPgccAccount" p ON p.id=s."pgccAccountId" WHERE (${filter.institution || ""}='' OR n.id=${filter.institution || ""}) AND (${filter.year || ""}='' OR left(a.competence,4)=${filter.year || ""}) AND (${filter.module || ""}='' OR b."moduleType"=${filter.module || ""}) AND (${start}='' OR b."receivedAt">=NULLIF(${start},'')::date) AND (${end}='' OR b."receivedAt"<NULLIF(${end},'')::date+INTERVAL '1 day') AND a."taxDueDecimal">=${minimum} AND (${maximum}::numeric IS NULL OR a."taxDueDecimal"<=${maximum}::numeric) ${type === "contas" ? sql`AND a."taxableBaseDecimal">0` : sql``} ORDER BY n.name,a.competence,p.code,s.code`);
    columns = ["Instituição", "Competência", "Conta", "Subtítulo", "LC116 cadastrada", "Receita", "Base", "Alíquota", "ISS apurado", "ISS a recolher"];
    rows = result.rows.map(row => [row.institution, row.competence, row.account, row.subtitle, row.serviceItem, row.revenue, row.base, row.rate, row.tax, row.due]);
  } else {
    const data = await readDesifManagement(database, filter);
    if (type === "autos") {
      columns = ["Número do auto", "Data", "Instituição", "Ano", "Valor original", "Fase administrativa"];
      rows = data.cases.map(row => [row.metadata.autoNumber || row.autoId, row.metadata.autoDate || String(row.createdAt), row.institution, row.metadata.calendarYear || row.competence.slice(0,4), row.amount, row.metadata.status || row.nativeStatus]);
    } else {
      columns = ["Instituição", "Competência", "Módulo", "Versão informada", "Importação", "Processamento", "Protocolo", "Situação"];
      rows = data.batches.map(row => [row.institution, row.competence, row.moduleType, row.version, String(row.receivedAt), row.processedAt ? String(row.processedAt) : null, row.receipt, row.status]);
    }
  }
  const output = await exportSimpleTable({ title: `DES-IF — ${type} — registros disponíveis`, columns, rows }, format as SimpleTabularFormat);
  return new Response(typeof output.body === "string" ? output.body : new Uint8Array(output.body), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="desif-${type}.${output.extension}"`, "Cache-Control": "no-store" } });
}
