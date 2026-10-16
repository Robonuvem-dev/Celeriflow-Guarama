import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertConstructionGedSignature } from "./construction-documents-service";
import { assertConstructionProjectStampDownload, type ConstructionProjectStampRow } from "./construction-project-stamp";
import { readConstructionPdf } from "./construction-document-storage";
// Authorization and message ownership are checked by the calling route.
// Ordinary FINAL complements remain downloadable; stamped/issued artifacts need
// their exact signed version and publication, never a different/latest FINAL copy.
export async function resolveConstructionComplementArtifact(db: PrismaClient | Prisma.TransactionClient, caseId: string, documentId: string, latest: { id: string; status: string; hashSha256: string; fileUrl: string }) {
  const stamp = (await db.$queryRaw<ConstructionProjectStampRow[]>`SELECT * FROM "ConstructionProjectStamp" WHERE "documentId"=${documentId} LIMIT 1`)[0];
  if (stamp) {
    if (stamp.caseId !== caseId || stamp.documentVersionId !== latest.id || stamp.hashSha256 !== latest.hashSha256 || stamp.fileUrl !== latest.fileUrl) throw new Error("Versão atual não corresponde à cópia carimbada assinada.");
    return { bytes: await assertConstructionProjectStampDownload(db, stamp), filename: "projeto-aprovado-copia-derivada.pdf" };
  }
  const issued = await db.constructionIssuedDocument.findUnique({ where: { documentId } });
  if (issued) {
    if (issued.caseId !== caseId || issued.status !== "PUBLISHED" || issued.documentVersionId !== latest.id || issued.hashSha256 !== latest.hashSha256 || issued.fileUrl !== latest.fileUrl) throw new Error("Documento emitido exige sua versão assinada e publicada.");
    await assertConstructionGedSignature(db, issued.documentVersionId); return { bytes: await readConstructionPdf(issued.fileUrl, issued.hashSha256), filename: `${issued.number.replaceAll("/", "-")}.pdf` };
  }
  if (!["FINAL", "SIGNED"].includes(latest.status)) throw new Error("Versão complementar indisponível.");
  if (latest.fileUrl.startsWith("construction-local:")) return { bytes: await readConstructionPdf(latest.fileUrl, latest.hashSha256), filename: "complemento-revisado.pdf" };
  return null;
}
