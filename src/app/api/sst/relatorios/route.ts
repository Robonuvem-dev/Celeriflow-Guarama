import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { reportCivilRange } from "@/lib/sst/report-service";
import { exportCertificateReport } from "@/lib/sst/functional-report-export";
import { SstValidationError } from "@/lib/sst/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "issueReports");
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = await exportCertificateReport(context, { ...params, page: undefined, ...reportCivilRange(params.from || "", params.until || "") }, { kind: params.kind, format: params.format });
    return new NextResponse(new Uint8Array(result.content), { headers: { "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="${result.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SstValidationError) return NextResponse.json({ error: "Confira os filtros e o período do relatório." }, { status: 400 });
    return NextResponse.json({ error: "Não foi possível emitir o relatório." }, { status: 500 });
  }
}
