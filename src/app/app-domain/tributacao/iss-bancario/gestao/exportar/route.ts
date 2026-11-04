import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { exportSimpleTable, type SimpleTabularFormat } from "@/lib/reports/simple-tabular-export";
import { readDesifManagement, type DesifReportFilter } from "@/lib/tributacao/desif-requirements";

export const dynamic = "force-dynamic";

const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export async function GET(request: Request) {
  const context = await getTenantContextForModule("TRIBUTACAO"),
    database = context.database ?? db;
  const url = new URL(request.url);
  const params = url.searchParams;
  const rawFormat = params.get("format") ?? "";
  const hasExplicitFormat = params.has("format") && rawFormat !== "";
  const format = hasExplicitFormat ? rawFormat.toLowerCase() : "pdf";
  if (hasExplicitFormat && !["pdf", "xlsx", "xls", "docx", "doc", "txt", "csv"].includes(format)) {
    return new Response("Formato indisponível.", { status: 400 });
  }
  const rawType = params.get("report") ?? "declaracoes";
  const type = ["declaracoes", "autos", "iss", "contas", "omissos", "debitos"].includes(rawType)
    ? rawType
    : "declaracoes";
  const filter: DesifReportFilter = Object.fromEntries(
    ["institution", "module", "start", "end", "status", "number", "year"].map((key) => [
      key,
      params.get(key) ?? "",
    ]),
  );

  let columns: string[], rows: (string | number | null)[][];
  const institutionsResult = await database.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM "DesifFinancialInstitution" ORDER BY name`,
  );

  if (type === "omissos") {
    const parsedYear = Number(filter.year);
    const year =
      Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= new Date().getFullYear()
        ? parsedYear
        : new Date().getFullYear();
    const result = await database.execute<{ institution: string; cnpj: string; competence: string }>(
      sql`SELECT i.name AS institution,i."baseCnpj" AS cnpj,to_char(m.month,'YYYY-MM') AS competence FROM "DesifFinancialInstitution" i CROSS JOIN generate_series(make_date(${year},1,1),LEAST(make_date(${year},12,1),date_trunc('month',CURRENT_DATE)),INTERVAL '1 month') AS m(month) WHERE i.status='ATIVA' AND i."validFrom"<m.month+INTERVAL '1 month' AND (i."validUntil" IS NULL OR i."validUntil">=m.month) AND (${filter.institution || ""}='' OR i.id=${filter.institution || ""}) AND NOT EXISTS (SELECT 1 FROM "DesifImportBatch" b WHERE b."institutionId"=i.id AND b.competence=to_char(m.month,'YYYY-MM') AND b.status='PROCESSADO' AND b."moduleType" IN ('APURACAO','APURACAO_BALANCETE_TARIFAS')) ORDER BY i.name,m.month`,
    );
    columns = ["Instituição cadastrada vigente", "CNPJ base", "Competência sem apuração mensal processada"];
    rows = result.rows.map((row) => [row.institution, row.cnpj, row.competence]);
  } else if (type === "debitos") {
    const result = await database.execute<{
      institution: string;
      competence: string;
      assessmentId: string;
      status: string;
      amount: string;
      guideNumber: string | null;
    }>(
      sql`SELECT i.name AS institution,d.competence,t.id AS "assessmentId",t.status,COALESCE(t."finalValueDecimal",t."originalValueDecimal",t."originalValue"::numeric)::text AS amount,g."guideNumber" FROM "DesifAssessment" d JOIN "DesifAgency" a ON a.id=d."agencyId" JOIN "DesifFinancialInstitution" i ON i.id=a."institutionId" JOIN "TaxAssessment" t ON t.id=d."taxAssessmentId" LEFT JOIN "TaxGuide" g ON g.id=d."guideId" WHERE (${filter.institution || ""}='' OR i.id=${filter.institution || ""}) AND (${filter.year || ""}='' OR left(d.competence,4)=${filter.year || ""}) ORDER BY i.name,d.competence`,
    );
    columns = ["Instituição", "Competência", "Lançamento tributário", "Situação", "Valor lançado", "Guia"];
    rows = result.rows.map((row) => [
      row.institution,
      row.competence,
      row.assessmentId,
      row.status,
      row.amount,
      row.guideNumber,
    ]);
  } else if (type === "iss" || type === "contas") {
    const start = filter.start && /^\d{4}-\d{2}-\d{2}$/.test(filter.start) ? filter.start : "";
    const end = filter.end && /^\d{4}-\d{2}-\d{2}$/.test(filter.end) ? filter.end : "";
    const minimum = z.coerce.number().finite().nonnegative().catch(0).parse(params.get("minimum") ?? 0);
    const maximum =
      params.has("maximum") && params.get("maximum") !== ""
        ? z.coerce.number().finite().nonnegative().catch(0).parse(params.get("maximum"))
        : null;
    const result = await database.execute<{
      institution: string;
      competence: string;
      account: string;
      subtitle: string;
      serviceItem: string | null;
      revenue: string;
      base: string;
      rate: string;
      tax: string;
      due: string;
    }>(
      sql`SELECT n.name AS institution,a.competence,p.code AS account,s.code AS subtitle,COALESCE(s."serviceItem",p."serviceItem") AS "serviceItem",a."revenueDecimal"::text AS revenue,a."taxableBaseDecimal"::text AS base,a.rate::text,a."grossTaxDecimal"::text AS tax,a."taxDueDecimal"::text AS due FROM "DesifAssessment" a JOIN "DesifImportBatch" b ON b.id=a."importBatchId" JOIN "DesifAgency" g ON g.id=a."agencyId" JOIN "DesifFinancialInstitution" n ON n.id=g."institutionId" JOIN "DesifSubtitle" s ON s.id=a."subtitleId" JOIN "DesifPgccAccount" p ON p.id=s."pgccAccountId" WHERE (${filter.institution || ""}='' OR n.id=${filter.institution || ""}) AND (${filter.year || ""}='' OR left(a.competence,4)=${filter.year || ""}) AND (${filter.module || ""}='' OR b."moduleType"=${filter.module || ""}) AND (${start}='' OR b."receivedAt">=NULLIF(${start},'')::date) AND (${end}='' OR b."receivedAt"<NULLIF(${end},'')::date+INTERVAL '1 day') AND a."taxDueDecimal">=${minimum} AND (${maximum}::numeric IS NULL OR a."taxDueDecimal"<=${maximum}::numeric) ${type === "contas" ? sql`AND a."taxableBaseDecimal">0` : sql``} ORDER BY n.name,a.competence,p.code,s.code`,
    );
    columns = [
      "Instituição",
      "Competência",
      "Conta",
      "Subtítulo",
      "LC116 cadastrada",
      "Receita",
      "Base",
      "Alíquota",
      "ISS apurado",
      "ISS a recolher",
    ];
    rows = result.rows.map((row) => [
      row.institution,
      row.competence,
      row.account,
      row.subtitle,
      row.serviceItem,
      row.revenue,
      row.base,
      row.rate,
      row.tax,
      row.due,
    ]);
  } else {
    const data = await readDesifManagement(database, filter);
    if (type === "autos") {
      columns = ["Número do auto", "Data", "Instituição", "Ano", "Valor original", "Fase administrativa"];
      rows = data.cases.map((row) => [
        row.metadata.autoNumber || row.autoId,
        row.metadata.autoDate || String(row.createdAt),
        row.institution,
        row.metadata.calendarYear || row.competence.slice(0, 4),
        row.amount,
        row.metadata.status || row.nativeStatus,
      ]);
    } else {
      columns = [
        "Instituição",
        "Competência",
        "Módulo",
        "Versão informada",
        "Importação",
        "Processamento",
        "Protocolo",
        "Situação",
      ];
      rows = data.batches.map((row) => [
        row.institution,
        row.competence,
        row.moduleType,
        row.version,
        String(row.receivedAt),
        row.processedAt ? String(row.processedAt) : null,
        row.receipt,
        row.status,
      ]);
    }
  }

  const reportTitles: Record<string, string> = {
    iss: "Relatório de Valores do ISS",
    declaracoes: "Relatório de Declarações Importadas",
    omissos: "Relatório de Omissos na Declaração Mensal",
    debitos: "Relatório de Débitos dos Contribuintes (Bancos)",
    contas: "Relatório de Contas declaradas com movimento tributável",
    autos: "Relatório de Autos de Infração do ISS Bancário",
  };

  const wantsHtml = !hasExplicitFormat && (request.headers.get("accept") ?? "").includes("text/html");
  if (wantsHtml) {
    const baseQuery = new URLSearchParams(params);
    baseQuery.set("report", type);
    const formatLinks = (["pdf", "xlsx", "xls", "docx", "doc", "txt", "csv"] as const)
      .map((fmt) => {
        const q = new URLSearchParams(baseQuery);
        q.set("format", fmt);
        return `<a class="btn" href="/tributacao/iss-bancario/gestao/exportar?${esc(q.toString())}">${fmt.toUpperCase()}</a>`;
      })
      .join("");

    const reportTabs = (["iss", "declaracoes", "omissos", "debitos", "contas", "autos"] as const)
      .map(
        (rep) =>
          `<a class="tab ${rep === type ? "active" : ""}" href="/tributacao/iss-bancario/gestao/exportar?report=${rep}">${esc(reportTitles[rep])}</a>`,
      )
      .join("");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DES-IF — ${esc(reportTitles[type])}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .hero { background: linear-gradient(135deg, #ffffff 0%, #f8fafc 65%, #eff6ff 100%); border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; }
    .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1d4ed8; margin: 0 0 4px; }
    h1 { font-size: 20px; margin: 0; color: #0f172a; }
    .sub { font-size: 13px; color: #475569; margin: 4px 0 0; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 22px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .tab, .btn { display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; cursor: pointer; }
    .tab.active, .btn-primary { background: #1d4ed8; border-color: #1d4ed8; color: #ffffff; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; align-items: end; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #334155; }
    input, select { height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 13px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 9px 12px; text-align: left; }
    th { background: #f8fafc; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
    @media print { body { background: #fff; padding: 0; } .no-print { display: none !important; } .card, .hero { border: 0; padding: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <div>
        <p class="kicker">ISS Bancário — Relatórios e Exportações DES-IF (CF28)</p>
        <h1>${esc(reportTitles[type])}</h1>
        <p class="sub">Total de registros localizados: <strong>${rows.length}</strong>. Selecione os filtros ou exporte nos formatos PDF, XLSX, XLS, DOCX, DOC, TXT e CSV.</p>
      </div>
      <div class="tabs no-print">
        <button class="btn" type="button" onclick="window.print()">Imprimir</button>
        <a class="btn" href="/tributacao/iss-bancario/gestao">Voltar à gestão</a>
        <a class="btn" href="/tributacao/iss-bancario">Painel ISS Bancário</a>
      </div>
    </header>

    <nav class="card tabs no-print" aria-label="Tipos de Relatório DES-IF">
      ${reportTabs}
    </nav>

    <section class="card no-print">
      <form action="/tributacao/iss-bancario/gestao/exportar" method="get" class="form-grid">
        <input type="hidden" name="report" value="${esc(type)}" />
        <label>
          Instituição
          <select name="institution">
            <option value="">Todas as instituições</option>
            ${institutionsResult.rows
              .map(
                (inst) =>
                  `<option value="${esc(inst.id)}" ${filter.institution === inst.id ? "selected" : ""}>${esc(inst.name)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>Ano-base<input type="number" name="year" value="${esc(filter.year ?? "")}" placeholder="2026" /></label>
        <label>Data inicial<input type="date" name="start" value="${esc(filter.start ?? "")}" /></label>
        <label>Data final<input type="date" name="end" value="${esc(filter.end ?? "")}" /></label>
        <div><button type="submit" class="btn btn-primary">Aplicar filtros</button></div>
      </form>
      <div class="tabs" style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;">
        <span style="font-size:12px;font-weight:700;color:#475569;">Exportar relatório como:</span>
        ${formatLinks}
      </div>
    </section>

    <section class="card" style="overflow-x:auto;">
      <table>
        <thead>
          <tr>${columns.map((col) => `<th>${esc(col)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${
            rows.length > 0
              ? rows
                  .map((r) => `<tr>${r.map((cell) => `<td>${esc(cell ?? "—")}</td>`).join("")}</tr>`)
                  .join("")
              : `<tr><td colspan="${columns.length}" style="text-align:center;padding:24px;color:#64748b;">Nenhum registro encontrado para os filtros selecionados.</td></tr>`
          }
        </tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const output = await exportSimpleTable(
    { title: `DES-IF — ${reportTitles[type] ?? type} — registros disponíveis`, columns, rows },
    format as SimpleTabularFormat,
  );
  return new Response(typeof output.body === "string" ? output.body : new Uint8Array(output.body), {
    headers: {
      "Content-Type": output.contentType,
      "Content-Disposition": `attachment; filename="desif-${type}.${output.extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
