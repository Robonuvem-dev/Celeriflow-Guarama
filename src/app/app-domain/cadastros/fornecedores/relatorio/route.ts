import { NextResponse } from "next/server";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getSupplierReportRows, parseSupplierFilters } from "../supplier-query";
import { buildSupplierCertificationCsv, sortSupplierReportRows } from "../supplier-report";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("CADASTROS", "issueReports");
    const filters = parseSupplierFilters(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const referenceDate = new Date();
    const suppliers = await getSupplierReportRows(context.database ?? db, filters, referenceDate);
    return new Response(`\uFEFF${buildSupplierCertificationCsv(sortSupplierReportRows(suppliers, new URL(request.url).searchParams.get("ordem")), referenceDate)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=relatorio-certidoes-fornecedores.csv",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro ao emitir relatório de fornecedores:", error);
    return NextResponse.json({ error: "Não foi possível emitir o relatório de fornecedores." }, { status: 500 });
  }
}
