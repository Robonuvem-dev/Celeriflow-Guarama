import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findPublicDocumentValidation } from "@/lib/documents/document-flow-service";
import { assertConstructionGedSignature } from "@/lib/obras/construction-documents-service";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { assertConstructionProjectStampDownload, type ConstructionProjectStampRow } from "@/lib/obras/construction-project-stamp";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code"); if (!code || !/^[a-f0-9]{32}$/.test(code)) return NextResponse.json({ valid: false }, { status: 404 });
  try {
    const issued = await prisma.constructionIssuedDocument.findUnique({ where: { validationCode: code } });
    if (!issued) {
      const stamp = (await prisma.$queryRaw<ConstructionProjectStampRow[]>`SELECT * FROM "ConstructionProjectStamp" WHERE "validationCode"=${code}`)[0];
      if (!stamp?.publishedAt) return NextResponse.json({ valid: false, reason: "Cópia derivada não publicada" }, { status: 404 });
      await assertConstructionProjectStampDownload(prisma, stamp); const validation = await findPublicDocumentValidation(prisma, code);
      return NextResponse.json({ valid: true, kind: "APPROVED_PROJECT_DERIVED_COPY", hashSha256: stamp.hashSha256, originalHash: stamp.originalHash, reviewId: stamp.reviewId, publishedAt: stamp.publishedAt, signature: validation?.signature, demonstration: true, format: "Cópia derivada do deferimento com assinatura interna GED destacada; sem homologação oficial ou PAdES" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (issued.status !== "PUBLISHED") return NextResponse.json({ valid: false, reason: "Não publicado ou substituído" }, { status: 404 });
    await assertConstructionGedSignature(prisma, issued.documentVersionId); await readConstructionPdf(issued.fileUrl, issued.hashSha256);
    const validation = await findPublicDocumentValidation(prisma, code);
    return NextResponse.json({ valid: true, number: issued.number, kind: issued.kind, hashSha256: issued.hashSha256, publishedAt: issued.publishedAt, validUntil: issued.validUntil, expired: Boolean(issued.validUntil && issued.validUntil < new Date()), signature: validation?.signature, format: "Assinatura GED destacada sobre hash SHA-256; não é assinatura PAdES embutida no PDF", demonstration: validation?.signature.kind === "INTERNAL" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ valid: false, reason: "Integridade ou assinatura não verificada" }, { status: 400 }); }
}
