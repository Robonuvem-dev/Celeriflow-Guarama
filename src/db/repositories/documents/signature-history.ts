import { and, count, desc, eq, ilike, ne, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { documentSignatures, documentVersions } from "../../schema/document-workflow";
import { documents } from "../../schema/registry";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export async function listMySignatureHistory(database: DatabaseExecutor, userId: string, requestedPage: number, query: string) {
  const term = query.trim();
  const where = and(
    eq(documentSignatures.signerUsuarioId, userId), ne(documentSignatures.status, "PENDING"),
    term ? or(ilike(documents.title, `%${term}%`), ilike(documents.documentType, `%${term}%`)) : undefined,
  );
  const [{ total }] = await database.select({ total: count() }).from(documentSignatures).innerJoin(documents, eq(documents.id, documentSignatures.documentId)).innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId)).where(where);
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const records = await database.select({
    id: documentSignatures.id, title: documents.title, documentType: documents.documentType,
    status: documentSignatures.status, provider: documentSignatures.provider, signedAt: documentSignatures.signedAt,
    updatedAt: documentSignatures.updatedAt, version: documentVersions.versionNumber, validationCode: documentVersions.publicValidationCode,
  }).from(documentSignatures).innerJoin(documents, eq(documents.id, documentSignatures.documentId))
    .innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId))
    .where(where).orderBy(desc(documentSignatures.updatedAt), desc(documentSignatures.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  return { records, total, page, query: term };
}
