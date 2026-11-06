import { NextResponse } from "next/server";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { loadBiddingReport } from "@/db/repositories/procurement/bidding-reports";
import {
  biddingReportCsv,
  generateBiddingReport,
  BIDDING_REPORT_TYPES,
  type BiddingReportType,
} from "@/lib/compras/bidding-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await getTenantContextForModuleOperation("COMPRAS", "issueReports");
    const { id } = await params;
    const url = new URL(request.url);

    const tipoParam = url.searchParams.get("tipo") as BiddingReportType | null;
    const tipo = tipoParam && Object.values(BIDDING_REPORT_TYPES).includes(tipoParam)
      ? tipoParam
      : BIDDING_REPORT_TYPES.RESUMO;

    const filters = {
      startDate: url.searchParams.get("inicio") || undefined,
      endDate: url.searchParams.get("fim") || undefined,
      fornecedor: url.searchParams.get("fornecedor") || undefined,
      material: url.searchParams.get("material") || undefined,
      ordem: (url.searchParams.get("ordem") as "asc" | "desc") || undefined,
    };

    const biddingData = await loadBiddingReport(databaseConnection.db, id);
    if (!biddingData) {
      return NextResponse.json({ error: "Licitação não encontrada." }, { status: 404 });
    }

    const report = generateBiddingReport(tipo, biddingData, filters);
    const csvContent = biddingReportCsv(report);

    const safeNumber = biddingData.number.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `relatorio-licitacao-${safeNumber}-${tipo}.csv`;

    return new Response(`\uFEFF${csvContent}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erro ao exportar CSV do relatório de licitação:", error);
    return NextResponse.json(
      { error: "Não foi possível gerar a exportação CSV do relatório." },
      { status: 500 },
    );
  }
}
