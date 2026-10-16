import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { assertConstructionGedSignature } from "@/lib/obras/construction-documents-service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id"); if (!id) throw new AccessError("Referência incompleta.", 404);
    const issued = await prisma.constructionIssuedDocument.findUnique({ where: { id } }); if (!issued || issued.status !== "PUBLISHED") throw new AccessError("Documento ainda não publicado ou substituído.", 404);
    const portal = request.nextUrl.searchParams.get("portal") === "1";
    if (portal) {
      const identity = await getConstructionPortalIdentity(); if (!await prisma.constructionCase.findFirst({ where: { AND: [{ id: issued.caseId }, constructionPortalCaseWhere(identity.id)] }, select: { id: true } })) throw new AccessError("Documento indisponível.", 404);
    } else {
      const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context); if (!await context.prisma.constructionCase.findFirst({ where: { AND: [{ id: issued.caseId }, constructionCaseWhere(access)] }, select: { id: true } })) throw new AccessError("Documento indisponível.", 404);
    }
    await assertConstructionGedSignature(prisma, issued.documentVersionId); const bytes = await readConstructionPdf(issued.fileUrl, issued.hashSha256);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${issued.number.replaceAll("/", "-")}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Document-SHA256": issued.hashSha256 } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível verificar e baixar o documento." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
