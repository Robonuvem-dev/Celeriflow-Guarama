import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readDemo, readDemoConsole, downloadDemoArtifact } from "@/lib/rh/esocial/service";
import { reconcileDemo } from "@/lib/rh/esocial/queries";
import { DEMO_LABEL } from "@/lib/rh/esocial/contracts";
import { AccessError } from "@/lib/platform/access-error";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const context = await getTenantContextForModule('RH');
    const url = new URL(request.url), period = url.searchParams.get("competencia") ?? "2026-10";
    const [area, id, operation] = (await params).path;
    const employerId = url.searchParams.get('employerId') || '';
    const state = await readDemoConsole(context, employerId, period);
    const download = async (hash: string, kind: string) => {
      const record = await readDemo(context, employerId, period);
      const artifact = record?.state.artifacts.find(a => a.hash === hash && a.kind === kind);
      if (!record || !artifact) throw new AccessError('Arquivo não encontrado neste declarante.',404);
      return downloadDemoArtifact(context,record.id,artifact.id);
    };
    if (area === "conciliacao") return Response.json(reconcileDemo(state), { headers });
    if (area === "arquivos" && id) {
      const artifact = state.artifacts.find(a=>a.id===id);
      if (!artifact) throw new AccessError("Arquivo não encontrado neste declarante.", 404);
      const file = await download(artifact.hash, artifact.kind);
      return new Response(file.xml, { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="DEMO-${artifact.hash}.xml"`, 'Content-Security-Policy':"sandbox; default-src 'none'" } });
    }
    if (area === "retornos") {
      if (id) {
        const total = state.totalizers.find(t => t.id === id);
        if (!total) throw new AccessError("Retorno não encontrado neste declarante.", 404);
        if (operation === "xml") { const file = await download(total.hash,'TOTALIZER'); return new Response(file.xml, { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="DEMO-${total.type}-${total.hash.slice(0, 12)}.xml"` } }); }
        if (operation === "historico") return Response.json({ origin: state.events.find(e => e.id === total.originEventId), consultations: state.consultations.filter(c => c.batchId === total.batchId), revision: total.revision }, { headers });
        return Response.json(total, { headers });
      }
      const rows = state.totalizers.filter(t => !url.searchParams.get("tipo") || t.type === url.searchParams.get("tipo"));
      const page = Math.min(Math.max(1, Number(url.searchParams.get("page")) || 1), Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
      return Response.json({ total: rows.length, page, records: rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE) }, { headers });
    }
    if (area === "eventos" && id) {
      const event = state.events.find(e => e.id === id);
      if (!event) throw new AccessError("Evento não encontrado neste declarante.", 404);
      if (operation === "export") {
        const fields = { ambiente: DEMO_LABEL, evento: event.type, competencia: event.period, matricula: event.registration ?? "", cpf: "***.***.***-**", status: event.status, recibo: event.receipt ?? "", ocorrencias: event.occurrences.map(o => `${o.codigo}: ${o.descricao}`).join("; ") };
        const csv = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
        const html = url.searchParams.get("format") === "html";
        const body = html ? `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>eSocial DEMO</title><h1>${escapeHtml(DEMO_LABEL)}</h1><dl>${Object.entries(fields).map(([key, value]) => `<dt>${key}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></html>` : "\uFEFF" + Object.keys(fields).map(csv).join(";") + "\r\n" + Object.values(fields).map(csv).join(";");
        return new Response(body, { headers: { ...headers, "Content-Type": html ? "text/html; charset=utf-8" : "text/csv; charset=utf-8", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `attachment; filename="DEMO-${event.type}.${html ? "html" : "csv"}"` } });
      }
      return Response.json(event, { headers });
    }
    throw new AccessError("Recurso não encontrado.", 404);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao consultar eSocial." }, { status: error instanceof AccessError ? error.status : 400, headers });
  }
}
