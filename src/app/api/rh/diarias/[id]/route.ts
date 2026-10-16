import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { buildTravelAllowanceDocument } from "@/lib/rh/travel-allowance";
import { renderHrReport } from "@/lib/rh/report-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const input = z.object({ type: z.enum(["SOLICITACAO", "AUTORIZACAO", "PRESTACAO", "HISTORICO"]).default("SOLICITACAO"), format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF") }).parse(Object.fromEntries(request.nextUrl.searchParams));
  const { id } = await params;
  try {
    const document = await buildTravelAllowanceDocument(context.prisma, id, input.type, context);
    const output = await renderHrReport(document, input.format);
    return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="diaria-${input.type.toLowerCase()}.${output.extension}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Documento indisponível." }, { status: 400 }); }
}
