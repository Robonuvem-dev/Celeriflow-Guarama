import { db } from "@/db/client";
import { loadBiddingReport } from "@/db/repositories/procurement/bidding-reports";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { biddingReportCsv, buildBiddingReport, isBiddingReportKind, validateBiddingReportPeriod } from "@/lib/compras/bidding-reports";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const kind = search.get("report") || "resumo";
  if (!isBiddingReportKind(kind)) return new Response("Relatório inválido.", { status: 400 });
  const filters = { supplierId: search.get("supplierId") || "", material: search.get("material") || "", start: search.get("start") || "", end: search.get("end") || "", order: search.get("order") || "" };
  const error = validateBiddingReportPeriod(filters.start, filters.end);
  if (error) return new Response(error, { status: 400 });
  const bidding = await loadBiddingReport(context.database ?? db, id);
  if (!bidding) return new Response("Licitação não encontrada.", { status: 404 });
  return new Response(biddingReportCsv(buildBiddingReport(bidding, kind, filters)), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="licitacao-${kind}.csv"`, "Cache-Control": "private, no-store",
  } });
}
