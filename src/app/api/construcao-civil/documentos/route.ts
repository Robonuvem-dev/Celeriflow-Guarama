import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { findConstructionCaseForAccess, findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { assertConstructionGedSignature } from "@/lib/obras/construction-documents-service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id"); if (!id) throw new AccessError("Referência incompleta.", 404);
    const [issued] = await db.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.id, id)).limit(1); if (!issued || issued.status !== "PUBLISHED") throw new AccessError("Documento ainda não publicado ou substituído.", 404);
    const portal = request.nextUrl.searchParams.get("portal") === "1";
    let database = db;
    if (portal) {
      const identity = await getConstructionPortalIdentity(); if (!await findConstructionCaseForPortal(database, issued.caseId, identity.id)) throw new AccessError("Documento indisponível.", 404);
    } else {
      const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context); database = context.database ?? db; if (!await findConstructionCaseForAccess(database, issued.caseId, access)) throw new AccessError("Documento indisponível.", 404);
    }
    await assertConstructionGedSignature(database, issued.documentVersionId); const bytes = await readConstructionPdf(issued.fileUrl, issued.hashSha256);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${issued.number.replaceAll("/", "-")}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Document-SHA256": issued.hashSha256 } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível verificar e baixar o documento." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
