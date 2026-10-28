import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { cemeteryLookup, cemeteryLookupSchema } from "@/lib/cemeteries/lookups";

export async function GET(request: NextRequest) {
  try {
    await getTenantContextForModule("CEMITERIOS");
    const input = cemeteryLookupSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (input.kind === "document") await getTenantContextForModule("DOCUMENTOS");
    return NextResponse.json(await cemeteryLookup(db, input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Consulta inválida." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
