import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { findConstructionCaseForAccess, findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { assertConstructionProjectStampDownload, getConstructionProjectStamp } from "@/lib/obras/construction-project-stamp";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id"); if (!id) throw new AccessError("Referência incompleta.", 404); const row = await getConstructionProjectStamp(db, id); if (!row) throw new AccessError("Cópia derivada indisponível.", 404);
    let database = db;
    if (request.nextUrl.searchParams.get("portal") === "1") { const identity = await getConstructionPortalIdentity(); if (!await findConstructionCaseForPortal(database, row.caseId, identity.id)) throw new AccessError("Projeto indisponível.", 404); }
    else { const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context); database = context.database ?? db; if (!await findConstructionCaseForAccess(database, row.caseId, access)) throw new AccessError("Projeto indisponível.", 404); }
    const bytes = await assertConstructionProjectStampDownload(database, row); return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=projeto-aprovado-copia-derivada.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Document-SHA256": row.hashSha256 } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Cópia derivada exige assinaturas completas e publicação." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
