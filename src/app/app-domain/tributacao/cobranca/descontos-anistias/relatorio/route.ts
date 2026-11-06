import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listDiscountAmnesties, type DiscountAmnestyItem } from "../repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
  const database = context.database ?? db;
  const rules = await listDiscountAmnesties(database);
  const url = new URL(request.url);
  const originFilter = url.searchParams.get("origin");

  const filtered = originFilter
    ? rules.filter((r: DiscountAmnestyItem) => r.originType === originFilter)
    : rules;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório de Parametrização de Descontos e Anistias</title>
  <style>
    body { font-family: sans-serif; font-size: 12px; margin: 20px; color: #1e293b; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p.subtitle { color: #64748b; margin-top: 0; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
    .badge-active { background: #dcfce7; color: #166534; }
    .badge-inactive { background: #fee2e2; color: #991b1b; }
    .text-right { text-align: right; }
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
  <h1>Relatório de Parametrização de Descontos e Anistias (REFIS / Emissão de Guias)</h1>
  <p class="subtitle">Emissão em: ${new Date().toLocaleString("pt-BR")} · Total de regras: ${filtered.length}</p>

  <table>
    <thead>
      <tr>
        <th style="width: 140px;">Regra / Programa</th>
        <th style="width: 90px;">Pasta</th>
        <th style="width: 110px;">Origem do Débito</th>
        <th style="width: 80px;">Situação</th>
        <th class="text-right" style="width: 65px;">Princ. (%)</th>
        <th class="text-right" style="width: 65px;">Multa (%)</th>
        <th class="text-right" style="width: 65px;">Juros (%)</th>
        <th class="text-right" style="width: 65px;">Corr. (%)</th>
        <th style="width: 140px;">Vigência</th>
        <th style="width: 60px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.map((r: DiscountAmnestyItem) => `
        <tr>
          <td>
            <strong>${r.name}</strong>
            ${r.referenceMessage ? `<div style="font-size: 10px; color: #64748b; margin-top: 4px;">Mensagem: ${r.referenceMessage}</div>` : ""}
          </td>
          <td>${r.scopeType}</td>
          <td>${r.originType.replaceAll("_", " ")}</td>
          <td>${r.debtStatus.replaceAll("_", " ")}</td>
          <td class="text-right">${r.principalDiscountPercent}%</td>
          <td class="text-right">${r.penaltyDiscountPercent}%</td>
          <td class="text-right">${r.interestDiscountPercent}%</td>
          <td class="text-right">${r.correctionDiscountPercent}%</td>
          <td>
            ${r.validFrom} a ${r.validUntil}
            ${r.dueDateLimit ? `<div style="font-size: 10px; color: #64748b;">Limite Venc: ${r.dueDateLimit}</div>` : ""}
          </td>
          <td>
            <span class="badge ${r.active ? "badge-active" : "badge-inactive"}">
              ${r.active ? "ATIVO" : "INATIVO"}
            </span>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
