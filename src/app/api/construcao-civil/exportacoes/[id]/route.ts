import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { findConstructionExport } from "@/db/repositories/infrastructure/construction-integrations";
import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { verifyExportHash } from "@/lib/obras/construction-export";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new AccessError("Download restrito ao gestor.", 403);
    const row = await findConstructionExport(db, access, id);
    if (!row) throw new AccessError("Lote indisponível.", 404);
    if (!verifyExportHash(row.payload, row.hashSha256)) throw new Error("Hash inconsistente.");
    return new NextResponse(row.payload, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="municipal-demo-${row.period}-v${row.version}.json"`, "Cache-Control": "private, no-store", "X-Content-SHA256": row.hashSha256 } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível verificar e baixar o lote." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
