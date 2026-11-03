import { desc, eq, or } from "drizzle-orm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionFiscalDocument } from "@/db/repositories/tax-actions/documents";
import { fiscalDocuments, fiscalOrders } from "@/db/schema/taxation-inspection";

const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function rows(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value))
    return `<ul>${value.map((item) => `<li>${rows(item)}</li>`).join("")}</ul>`;
  if (typeof value === "object")
    return `<table>${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `<tr><th>${esc(key)}</th><td>${rows(item)}</td></tr>`)
      .join("")}</table>`;
  return esc(value);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }
  const database = taxActionConnection(await getTenantContextForModule("TRIBUTACAO")).db;
  const isPlaceholder = id === "[id]" || id.toLowerCase() === "id";

  let item = !isPlaceholder ? await actionFiscalDocument(database, id) : null;
  if (!item && !isPlaceholder) {
    const [byNumber] = await database
      .select({ id: fiscalDocuments.id })
      .from(fiscalDocuments)
      .where(or(eq(fiscalDocuments.id, id), eq(fiscalDocuments.documentNumber, id)))
      .limit(1);
    if (byNumber) {
      item = await actionFiscalDocument(database, byNumber.id);
    }
  }
  if (!item) {
    const [latest] = await database
      .select({ id: fiscalDocuments.id })
      .from(fiscalDocuments)
      .innerJoin(fiscalOrders, eq(fiscalOrders.id, fiscalDocuments.orderId))
      .orderBy(desc(fiscalDocuments.issuedAt))
      .limit(1);
    if (latest) {
      item = await actionFiscalDocument(database, latest.id);
    }
  }

  const recentList = await database
    .select({
      id: fiscalDocuments.id,
      documentNumber: fiscalDocuments.documentNumber,
      documentKind: fiscalDocuments.documentKind,
      status: fiscalDocuments.status,
    })
    .from(fiscalDocuments)
    .orderBy(desc(fiscalDocuments.issuedAt))
    .limit(12);

  const navLinks = recentList
    .map(
      (doc) =>
        `<a href="/tributacao/fiscalizacao/documentos/${esc(doc.id)}" class="pill ${item?.id === doc.id ? "active" : ""}">${esc(doc.documentKind.replaceAll("_", " "))} · ${esc(doc.documentNumber)}</a>`,
    )
    .join("");

  const styles = `
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; }
    .toolbar { max-width: 920px; margin: 0 auto 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .nav-pills { max-width: 920px; margin: 0 auto 14px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; font-size: 12px; }
    .pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; color: #334155; text-decoration: none; font-weight: 600; background: #f8fafc; }
    .pill.active { background: #1d4ed8; border-color: #1d4ed8; color: #ffffff; }
    .btn { display: inline-flex; align-items: center; justify-content: center; height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid #1d4ed8; background: #1d4ed8; color: #ffffff; font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .btn-secondary { background: #ffffff; border-color: #cbd5e1; color: #334155; }
    .sheet { max-width: 920px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 28px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05); }
    h1 { font-size: 20px; margin: 0 0 14px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; text-align: left; }
    th { width: 28%; background: #f8fafc; color: #334155; font-weight: 600; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 13px; }
    .meta p { margin: 0; }
    .notice { margin-top: 18px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 12px; color: #92400e; }
    @media print { body { background: #fff; padding: 0; } .toolbar, .nav-pills { display: none; } .sheet { border: 0; box-shadow: none; padding: 0; } }
  `;

  if (!item) {
    const emptyHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Documentos Fiscais</title><style>${styles}</style></head><body><div class="toolbar"><strong>Fiscalização Tributária — Documentos Fiscais</strong><div><a class="btn btn-secondary" href="/tributacao/fiscalizacao/gestao">Gestão de Termos e Autos</a> <a class="btn" href="/tributacao/fiscalizacao">Ir para Fiscalização</a></div></div><main class="sheet"><h1>Consulta de Documento Fiscal</h1><p>Nenhum documento fiscal localizado para o identificador informado (<code>${esc(id)}</code>).</p><div class="notice">Utilize o painel de Fiscalização ou a Gestão de Termos e Autos para emitir ou selecionar um TIAF, Termo Fiscal, Termo de Encerramento ou Auto de Infração.</div></main></body></html>`;
    return new Response(emptyHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(item.documentNumber)}</title><style>${styles}</style></head><body><div class="toolbar"><div><strong>Documento Fiscal: ${esc(item.documentNumber)}</strong></div><div style="display:flex;gap:8px"><a class="btn btn-secondary" href="/tributacao/fiscalizacao/gestao">Voltar à gestão</a><a class="btn btn-secondary" href="/tributacao/fiscalizacao">Painel de Fiscalização</a><button class="btn" onclick="window.print()">Imprimir</button></div></div>${recentList.length > 1 ? `<nav class="nav-pills"><span>Documentos recentes:</span>${navLinks}</nav>` : ""}<main class="sheet"><h1>${esc(item.documentKind.replaceAll("_", " "))}</h1><div class="meta"><p><b>Número</b><br/>${esc(item.documentNumber)}</p><p><b>OS</b><br/>${esc(item.order.orderNumber)}</p><p><b>Situação</b><br/>${esc(item.status)}</p><p><b>Emissão</b><br/>${esc(item.issuedAt.toLocaleString("pt-BR"))}</p></div>${rows(item.contentSnapshot)}<div class="notice">Documento gerado a partir do snapshot preservado da ação fiscal. Ciência pendente permanece indicada como pendente; aviso eletrônico não equivale automaticamente à ciência.</div></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${item.documentKind.toLowerCase()}-${item.id}.html"`,
    },
  });
}
