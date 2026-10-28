import { NextRequest, NextResponse } from "next/server";
import { and, eq, exists, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { documentVersions } from "@/db/schema/document-workflow";
import { constructionIssuedDocuments, constructionProjectStamps } from "@/db/schema/construction-documents";
import { processDocuments } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const caseId = request.nextUrl.searchParams.get("caseId"), versionId = request.nextUrl.searchParams.get("versionId"); if (!caseId || !versionId) throw new AccessError("Referência incompleta.", 404);
    const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
    const record = await findConstructionCaseForAccess(db, caseId, access); if (!record) throw new AccessError("Solicitação indisponível.", 404);
    const [version] = await db.select().from(documentVersions).where(and(eq(documentVersions.id, versionId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), exists(db.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, documentVersions.documentId), eq(processDocuments.processId, record.processId)))))).limit(1);
    if (!version || (await db.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.documentId, version.documentId)).limit(1)).length) throw new AccessError("Projeto indisponível.", 404);
    if ((await db.select({ id: constructionProjectStamps.id }).from(constructionProjectStamps).where(eq(constructionProjectStamps.documentId, version.documentId)).limit(1)).length) throw new AccessError("Cópia carimbada disponível apenas após assinatura e publicação.", 403);
    const bytes = await readConstructionPdf(version.fileUrl, version.hashSha256);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=projeto.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível abrir o projeto PDF." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
