import { NextRequest, NextResponse } from "next/server";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const caseId = request.nextUrl.searchParams.get("caseId"), versionId = request.nextUrl.searchParams.get("versionId"); if (!caseId || !versionId) throw new AccessError("Referência incompleta.", 404);
    const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
    const record = await context.prisma.constructionCase.findFirst({ where: { AND: [{ id: caseId }, constructionCaseWhere(access)] }, select: { processId: true } }); if (!record) throw new AccessError("Solicitação indisponível.", 404);
    const version = await context.prisma.documentVersion.findFirst({ where: { id: versionId, document: { processDocuments: { some: { processId: record.processId } } }, status: { in: ["FINAL", "SIGNED"] } } });
    if (!version || await context.prisma.constructionIssuedDocument.findUnique({ where: { documentId: version.documentId } })) throw new AccessError("Projeto indisponível.", 404);
    if ((await context.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "ConstructionProjectStamp" WHERE "documentId"=${version.documentId} LIMIT 1`).length) throw new AccessError("Cópia carimbada disponível apenas após assinatura e publicação.", 403);
    const bytes = await readConstructionPdf(version.fileUrl, version.hashSha256);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=projeto.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível abrir o projeto PDF." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
