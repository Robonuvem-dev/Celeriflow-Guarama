import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listDocumentMessages, type DocumentMessageItem } from "../repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "issueReports");
  const database = context.database ?? db;
  const messages = await listDocumentMessages(database);
  const url = new URL(request.url);
  const docTypeFilter = url.searchParams.get("type");

  const filtered = docTypeFilter
    ? messages.filter((m: DocumentMessageItem) => m.documentType === docTypeFilter)
    : messages;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório de Mensagens de Documentos Fiscais</title>
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
  <h1>Relatório de Mensagens e Parametrizações de Documentos Fiscais</h1>
  <p class="subtitle">Emissão em: ${new Date().toLocaleString("pt-BR")} · Total de registros: ${filtered.length}</p>

  <table>
    <thead>
      <tr>
        <th style="width: 140px;">Título</th>
        <th style="width: 110px;">Tipo Documento</th>
        <th style="width: 90px;">Posicionamento</th>
        <th style="width: 70px;">Exercício</th>
        <th>Mensagem Parametrizada</th>
        <th style="width: 130px;">Validade</th>
        <th style="width: 60px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.map((m: DocumentMessageItem) => `
        <tr>
          <td><strong>${m.title}</strong></td>
          <td>${m.documentType.replaceAll("_", " ")}</td>
          <td>${m.placement}</td>
          <td>${m.competenceYear ?? "Todos"}</td>
          <td>${m.messageContent}</td>
          <td>${m.validFrom || m.validUntil ? `${m.validFrom ?? "—"} a ${m.validUntil ?? "—"}` : "Indeterminada"}</td>
          <td>
            <span class="badge ${m.active ? "badge-active" : "badge-inactive"}">
              ${m.active ? "ATIVO" : "INATIVO"}
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
