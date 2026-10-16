import { NextRequest, NextResponse } from "next/server";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { cemeteryLookup, cemeteryLookupSchema } from "@/lib/cemeteries/lookups";

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContextForModule("CEMITERIOS");
    const input = cemeteryLookupSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (input.kind === "document") await getTenantContextForModule("DOCUMENTOS");
    return NextResponse.json(await cemeteryLookup(context.prisma, input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Consulta inválida." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
