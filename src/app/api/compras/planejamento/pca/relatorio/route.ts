import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { listInternalPhaseMonitoringItems } from "@/db/repositories/procurement/internal-phase-documents";
import { listPcaObjectives, listPurchasePlannings } from "@/db/repositories/procurement/purchase-planning";
import { departments } from "@/db/schema/administration";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import { getCf30GovernanceAndWarrantyDescriptor } from "@/lib/compras/internal-phase-documents";
import {
  buildPcaManagerialReportCsv,
  consolidatePca,
  identifyCollectivePurchaseOpportunities,
  summarizeInternalPhaseMonitoring,
} from "@/lib/compras/pca-consolidation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(request: Request) {
  const context = await getTenantContextForModule("COMPRAS");
  const database = context.database ?? db;
  const url = new URL(request.url);
  const exercicio = url.searchParams.get("exercicio");
  const unidade = url.searchParams.get("unidade");
  const objetivo = url.searchParams.get("objetivo");
  const formato = url.searchParams.get("formato");

  const currentYear = Number(
    new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()),
  );
  const year = exercicio && /^\d{4}$/.test(exercicio) ? Number(exercicio) : currentYear;

  const [plannings, objectives, origins, monitoringItems] = await Promise.all([
    listPurchasePlannings(database),
    listPcaObjectives(database),
    database
      .select({ id: purchaseRequests.id, unitId: departments.id, unitName: departments.name })
      .from(purchaseRequests)
      .leftJoin(departments, eq(departments.id, purchaseRequests.departmentId)),
    listInternalPhaseMonitoringItems(database, year),
  ]);

  const byRequest = new Map(origins.map(o => [o.id, o]));
  const objectiveById = new Map(objectives.map(o => [o.id, o]));
  const demands = plannings.map(planning => {
    const origin = planning.originPurchaseRequestId ? byRequest.get(planning.originPurchaseRequestId) : undefined;
    return {
      id: planning.id,
      year: planning.expectedPeriodStart.getUTCFullYear(),
      unitId: origin?.unitId ?? null,
      unitName: origin?.unitName ?? null,
      objectiveId: planning.objectiveId,
      catalogItemId: planning.catalogItemId,
      unit: planning.unit,
      quantity: planning.quantity,
      status: planning.status,
      expectedPeriodStart: planning.expectedPeriodStart.toISOString().slice(0, 10),
      expectedPeriodEnd: planning.expectedPeriodEnd.toISOString().slice(0, 10),
      description: planning.catalogItem?.name ?? planning.description ?? "Item sem especificação",
      estimatedValue: String(planning.estimatedValueDecimal),
    };
  });

  const groups = consolidatePca(
    demands,
    year,
    unidade === "sem-unidade" ? "" : unidade || undefined,
    objetivo || undefined,
  );
  const opportunities = identifyCollectivePurchaseOpportunities(demands, year);
  const monitoring = summarizeInternalPhaseMonitoring(monitoringItems);
  const governance = getCf30GovernanceAndWarrantyDescriptor();

  if (context.user?.id) {
    await insertAuditEvent(database, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.reportIssued,
      targetType: "PCA_MANAGERIAL_REPORT",
      targetId: String(year),
    });
  }

  if (formato === "csv") {
    const csv = buildPcaManagerialReportCsv(year, groups, opportunities);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-pca-${year}.csv"`,
      },
    });
  }

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Gerencial do PCA e Fase Interna · Exercício ${year}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; color: #0f172a; line-height: 1.45; }
    h1, h2, h3 { margin: 0 0 8px 0; }
    .meta { color: #475569; font-size: 13px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #f8fafc; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 20px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .print-bar { margin-bottom: 16px; }
    @media print { .print-bar { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="print-bar">
    <button onclick="window.print()">Imprimir / Salvar em PDF</button>
  </div>
  <h1>Relatório Gerencial — Plano de Contratações Anual (PCA ${year}) e Fase Interna</h1>
  <p class="meta">Conformidade com a ${escapeHtml(governance.legalFramework.primaryLaw)} · Emitido por ${escapeHtml(context.user.name ?? context.user.email)}</p>

  <div class="grid">
    <div class="card">
      <strong>Total de Demandas (${year})</strong>
      <div>${monitoring.totalDemands} demanda(s)</div>
      <div>Valor estimado: ${escapeHtml(money.format(monitoring.totalEstimatedValue.toNumber()))}</div>
    </div>
    <div class="card">
      <strong>Documentos da Fase Interna</strong>
      <div>DFD: ${monitoring.documentsProgress.withDfd} (${monitoring.documentsProgress.dfdApproved} aprov.)</div>
      <div>ETP: ${monitoring.documentsProgress.withEtp} (${monitoring.documentsProgress.etpApproved} aprov.)</div>
      <div>TR: ${monitoring.documentsProgress.withTr} (${monitoring.documentsProgress.trApproved} aprov.)</div>
      <div>GED vinculados: ${monitoring.documentsProgress.gedLinkedTotal}</div>
    </div>
    <div class="card">
      <strong>Coerência e Encadeamento</strong>
      <div>Coerentes: ${monitoring.documentsProgress.coherentCount}</div>
      <div>Com alertas: ${monitoring.documentsProgress.inconsistentCount}</div>
    </div>
    <div class="card">
      <strong>Prazos e Cronograma</strong>
      <div>No prazo: ${monitoring.deadlines.onTrackCount}</div>
      <div>Próx. 30 dias: ${monitoring.deadlines.dueSoonCount}</div>
      <div>Vencidos: ${monitoring.deadlines.overdueCount}</div>
    </div>
  </div>

  <h2>1. Oportunidades de Compras Coletivas (${opportunities.length})</h2>
  ${
    opportunities.length === 0
      ? "<p>Nenhuma oportunidade de compra coletiva identificada para o filtro atual.</p>"
      : `<table>
          <thead>
            <tr>
              <th>Item / Serviço</th>
              <th>Qtd. Total</th>
              <th>Valor Consolidado</th>
              <th>Unidades Participantes</th>
            </tr>
          </thead>
          <tbody>
            ${opportunities
              .map(
                op => `<tr>
                  <td>${escapeHtml(op.label)}</td>
                  <td>${op.totalQuantity.toNumber()} ${escapeHtml(op.unit)}</td>
                  <td>${escapeHtml(money.format(op.totalEstimatedValue.toNumber()))}</td>
                  <td>${op.units.map(u => `${escapeHtml(u.unitName)} (${u.quantity.toNumber()} ${escapeHtml(op.unit)})`).join("; ")}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
  }

  <h2>2. Demandas Consolidadas por Unidade Administrativa</h2>
  ${
    groups.length === 0
      ? "<p>Nenhuma demanda consolidada para os filtros informados.</p>"
      : groups
          .map(
            group => `<h3>${escapeHtml(group.name)} — ${group.demands.length} demanda(s) (${escapeHtml(money.format(group.total.toNumber()))})</h3>
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Qtd. / Unidade</th>
                  <th>Período Previsto</th>
                  <th>Objetivo PPA</th>
                  <th>Valor Estimado</th>
                </tr>
              </thead>
              <tbody>
                ${group.demands
                  .map(d => {
                    const obj = d.objectiveId ? objectiveById.get(d.objectiveId) : undefined;
                    return `<tr>
                      <td>${escapeHtml(d.description)}</td>
                      <td>${d.quantity ?? 1} ${escapeHtml(d.unit ?? "un")}</td>
                      <td>${escapeHtml(d.expectedPeriodStart ?? "-")} a ${escapeHtml(d.expectedPeriodEnd ?? "-")}</td>
                      <td>${escapeHtml(obj ? `${obj.code} · ${obj.description}` : "Sem objetivo vinculado")}</td>
                      <td>${escapeHtml(money.format(Number(d.estimatedValue)))}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`,
          )
          .join("")
  }

  <h2>3. Governança, Conformidade Legal e Termo de Garantia Técnica (${governance.warrantyAndSupport.warrantyMonths} Meses)</h2>
  <p class="meta">
    Garantia mínima de ${governance.warrantyAndSupport.warrantyMonths} meses (${escapeHtml(governance.warrantyAndSupport.coverageStartCondition)}), incluindo manutenção corretiva, atualização normativa (Lei nº 14.133/2021) e suporte técnico contínuo.
  </p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

