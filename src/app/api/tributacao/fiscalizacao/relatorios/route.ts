import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema/administration";
import { fiscalDocuments, fiscalOrders } from "@/db/schema/taxation-inspection";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "html").toLowerCase();
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const taxpayerId = searchParams.get("taxpayerId");
  const employeeId = searchParams.get("employeeId");
  const status = searchParams.get("status");
  const kind = searchParams.get("kind");
  const model = searchParams.get("model");

  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;

  const date = (val?: string | null, isEnd = false) =>
    val && /^\d{4}-\d{2}-\d{2}$/.test(val) && Number.isFinite(Date.parse(val))
      ? new Date(`${val}T${isEnd ? "23:59:59.999" : "00:00:00.000"}Z`)
      : undefined;

  const start = date(startParam);
  const end = date(endParam, true);

  const orders = await database
    .select()
    .from(fiscalOrders)
    .where(
      and(
        taxpayerId ? eq(fiscalOrders.taxpayerId, taxpayerId) : undefined,
        employeeId ? eq(fiscalOrders.responsibleEmployeeId, employeeId) : undefined,
        model ? sql`${fiscalOrders.scope}->>'orderModel'=${model}` : undefined,
        status ? eq(fiscalOrders.status, status) : undefined,
        start ? gte(fiscalOrders.issuedAt, start) : undefined,
        end ? lte(fiscalOrders.issuedAt, end) : undefined
      )
    )
    .orderBy(desc(fiscalOrders.issuedAt));

  const inspectors = await database
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  const inspectorMap = new Map(inspectors.map((i) => [i.id, i.name]));

  const documents = orders.length
    ? await database
        .select()
        .from(fiscalDocuments)
        .where(
          and(
            inArray(
              fiscalDocuments.orderId,
              orders.map((o) => o.id)
            ),
            kind ? eq(fiscalDocuments.documentKind, kind) : undefined
          )
        )
        .orderBy(desc(fiscalDocuments.issuedAt))
    : [];

  const rows = orders.map((o) => ({
    orderNumber: o.orderNumber,
    taxpayerId: o.taxpayerId || "Imóvel / Genérico",
    inspector: inspectorMap.get(o.responsibleEmployeeId) || o.responsibleEmployeeId,
    issuedAt: o.issuedAt.toLocaleDateString("pt-BR"),
    status: o.status,
    procedure: (o.scope as Record<string, unknown>)?.procedure ? String((o.scope as Record<string, unknown>).procedure) : "Ordinária",
    period: `${(o.scope as Record<string, unknown>)?.periodStart || "—"} a ${(o.scope as Record<string, unknown>)?.periodEnd || "—"}`,
    dueDate: (o.scope as Record<string, unknown>)?.dueDate ? String((o.scope as Record<string, unknown>).dueDate) : "—",
  }));

  if (format === "txt") {
    const lines = [
      "================================================================================",
      "MUNICÍPIO DE GUARAMÁ - PR | SECRETARIA MUNICIPAL DE FAZENDA",
      "RELATÓRIO GERENCIAL DE ORDENS DE SERVIÇO E AÇÕES FISCAIS",
      `EMISSÃO: ${new Date().toLocaleString("pt-BR")}`,
      `PERÍODO: ${startParam || "Início"} até ${endParam || "Atualidade"}`,
      "================================================================================",
      `TOTAL DE ORDENS LOCALIZADAS: ${rows.length}`,
      `TOTAL DE DOCUMENTOS/TERMOS VINCULADOS: ${documents.length}`,
      "--------------------------------------------------------------------------------",
      "Nº ORDEM     | CONTRIBUINTE         | AUDITOR             | EMISSÃO    | SITUAÇÃO",
      "--------------------------------------------------------------------------------",
      ...rows.map(
        (r) =>
          `${r.orderNumber.padEnd(12)} | ${r.taxpayerId.slice(0, 20).padEnd(20)} | ${r.inspector.slice(0, 19).padEnd(19)} | ${r.issuedAt.padEnd(10)} | ${r.status}`
      ),
      "================================================================================",
    ];
    return new Response(lines.join("\r\n"), {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `inline; filename="relatorio-fiscalizacao-${new Date().toISOString().slice(0, 10)}.txt"`,
      },
    });
  }

  if (format === "xls" || format === "xlsx" || format === "csv") {
    const csvHeader = "Numero Ordem;Contribuinte;Auditor;Data Emissao;Situacao;Procedimento;Periodo Fiscalizado;Prazo Cumprimento\r\n";
    const csvBody = rows
      .map(
        (r) =>
          `"${r.orderNumber}";"${r.taxpayerId}";"${r.inspector}";"${r.issuedAt}";"${r.status}";"${r.procedure}";"${r.period}";"${r.dueDate}"`
      )
      .join("\r\n");
    return new Response(csvHeader + csvBody, {
      status: 200,
      headers: {
        "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="relatorio-fiscalizacao-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "xls"}"`,
      },
    });
  }

  // HTML / PDF (HTML renderizável e imprimível)
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório Gerencial de Fiscalização Tributária</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; font-size: 13px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 18px; font-weight: bold; margin: 0 0 4px; color: #0f172a; }
    .sub { font-size: 12px; color: #475569; margin: 0; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #e0f2fe; color: #0369a1; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; color: #334155; }
    tr:nth-child(even) { background: #f8fafc; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
    .btn { padding: 6px 12px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 12px; border: none; cursor: pointer; }
    .btn-outline { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
    @media print { .toolbar { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">Imprimir / Salvar em PDF</button>
    <a class="btn btn-outline" href="?${searchParams.toString()}&format=xls">Exportar XLS</a>
    <a class="btn btn-outline" href="?${searchParams.toString()}&format=txt">Exportar TXT</a>
    <a class="btn btn-outline" href="/tributacao/fiscalizacao/gestao">Voltar para Gestão</a>
  </div>
  <header class="header">
    <div>
      <h1 class="title">Relatório Gerencial de Fiscalização Tributária</h1>
      <p class="sub">Secretaria Municipal de Fazenda de Guaramá — PR · Fiscalização de Tributos Municipais</p>
    </div>
    <div style="text-align: right;">
      <span class="badge">CF22 — Gestão e Acompanhamento</span>
      <p class="sub" style="margin-top: 4px;">Gerado em: ${new Date().toLocaleString("pt-BR")}</p>
    </div>
  </header>
  <div>
    <strong>Filtros aplicados:</strong> Período: ${startParam || "Início"} a ${endParam || "Atualidade"} · Contribuinte: ${taxpayerId || "Todos"} · Auditor: ${employeeId ? inspectorMap.get(employeeId) || employeeId : "Todos"} · Situação: ${status || "Todas"}
  </div>
  <table>
    <thead>
      <tr>
        <th>Nº Ordem</th>
        <th>Contribuinte</th>
        <th>Auditor Responsável</th>
        <th>Emissão</th>
        <th>Procedimento</th>
        <th>Período Fiscalizado</th>
        <th>Prazo</th>
        <th>Situação</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length === 0 ? '<tr><td colspan="8" style="text-align: center; color: #64748b;">Nenhuma ordem de fiscalização encontrada para os parâmetros informados.</td></tr>' : rows.map((r) => `
        <tr>
          <td><strong>${r.orderNumber}</strong></td>
          <td>${r.taxpayerId}</td>
          <td>${r.inspector}</td>
          <td>${r.issuedAt}</td>
          <td>${r.procedure}</td>
          <td>${r.period}</td>
          <td>${r.dueDate}</td>
          <td><span class="badge">${r.status}</span></td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <div style="margin-top: 18px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between;">
    <span>Total de ordens listadas: <strong>${rows.length}</strong></span>
    <span>Total de atos/documentos: <strong>${documents.length}</strong></span>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(format === "pdf" ? { "content-disposition": 'inline; filename="relatorio-fiscalizacao.pdf"' } : {}),
    },
  });
}
