import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readVenalValueReport, type VenalReportFilters, type VenalReportTaxpayerGroup, type VenalReportItem } from "../repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
  const database = context.database ?? db;
  const url = new URL(request.url);

  const filters: VenalReportFilters = {
    localityMode: (url.searchParams.get("locality") || "TODOS") as any,
    taxpayerId: url.searchParams.get("taxpayerId") || undefined,
    statusMode: (url.searchParams.get("status") || "TODOS") as any,
    onlyWithVenalValue: url.searchParams.get("onlyVenal") === "true"
  };

  const report = await readVenalValueReport(database, filters);

  const money = (val: number) =>
    val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório de Imóveis por Contribuinte e Valor Venal</title>
  <style>
    body { font-family: sans-serif; font-size: 11px; margin: 20px; color: #1e293b; }
    h1 { font-size: 15px; margin-bottom: 2px; }
    p.subtitle { color: #64748b; margin-top: 0; margin-bottom: 12px; font-size: 11px; }
    .taxpayer-block { margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
    .taxpayer-header { background: #f1f5f9; padding: 6px 10px; font-weight: bold; border-bottom: 1px solid #cbd5e1; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; }
    th { background: #f8fafc; font-size: 10px; color: #475569; }
    .text-right { text-align: right; }
    .subtotal-row { background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1; }
    .grand-total { background: #047857; color: white; padding: 10px; border-radius: 4px; margin-top: 16px; display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px;">
    <button onclick="window.print()" style="padding: 6px 12px; background: #047857; color: white; border: none; border-radius: 4px; cursor: pointer;">Imprimir Relatório</button>
  </div>

  <h1>Relatório de Imóveis por Contribuinte · Composição de Valor Venal</h1>
  <p class="subtitle">Emissão: ${new Date().toLocaleString("pt-BR")} · Filtros: Localidade: ${filters.localityMode} | Situação: ${filters.statusMode} | Imóveis listados: ${report.totalProperties}</p>

  ${report.groups.map((group: VenalReportTaxpayerGroup) => `
    <div class="taxpayer-block">
      <div class="taxpayer-header">
        <span>Contribuinte: ${group.taxpayerName} ${group.document ? `(CPF/CNPJ: ${group.document})` : ""}</span>
        <span>${group.items.length} imóvel(is) vinculado(s)</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 100px;">Inscrição</th>
            <th style="width: 80px;">Matrícula</th>
            <th>Endereço Completo</th>
            <th style="width: 50px;">Qd.</th>
            <th style="width: 50px;">Lt.</th>
            <th style="width: 60px;">Situação</th>
            <th class="text-right" style="width: 90px;">Venal Territorial</th>
            <th class="text-right" style="width: 90px;">Venal Predial</th>
            <th class="text-right" style="width: 95px;">Valor Venal Total</th>
          </tr>
        </thead>
        <tbody>
          ${group.items.map((item: VenalReportItem) => `
            <tr>
              <td><strong>${item.municipalInsc}</strong></td>
              <td>${item.registration}</td>
              <td>${item.address}</td>
              <td>${item.block}</td>
              <td>${item.lot}</td>
              <td>${item.status}</td>
              <td class="text-right">R$ ${money(item.venalTerritorial)}</td>
              <td class="text-right">R$ ${money(item.venalPredial)}</td>
              <td class="text-right"><strong>R$ ${money(item.venalTotal)}</strong></td>
            </tr>
          `).join("")}
          <tr class="subtotal-row">
            <td colspan="6" style="text-align: right;">Subtotal do Contribuinte:</td>
            <td class="text-right">R$ ${money(group.sumTerritorial)}</td>
            <td class="text-right">R$ ${money(group.sumPredial)}</td>
            <td class="text-right">R$ ${money(group.sumTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `).join("")}

  ${report.groups.length === 0 ? `<p style="text-align: center; color: #64748b; padding: 20px;">Nenhum imóvel encontrado para os filtros selecionados.</p>` : ""}

  <div class="grand-total">
    <span>TOTAL GERAL DO MUNICÍPIO (${report.totalProperties} imóveis)</span>
    <span>Territorial: R$ ${money(report.grandTotalTerritorial)} | Predial: R$ ${money(report.grandTotalPredial)} | Total Venal: R$ ${money(report.grandTotal)}</span>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
