import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { buildMunicipalAdvanceDocument } from "@/lib/rh/advance-document";
import { db } from "@/db/client";
import { renderHrReport } from "@/lib/rh/report-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  try {
    const input = z.object({ format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF") }).parse(Object.fromEntries(request.nextUrl.searchParams));
    const { id } = await params;
    const document = await buildMunicipalAdvanceDocument(context.database ?? db, context, id);
    const output = await renderHrReport(document, input.format);
    return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="adiantamento.${output.extension}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Documento indisponível." }, { status: 400 });
  }
}
