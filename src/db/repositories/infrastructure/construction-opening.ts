import { and, desc, eq, exists, gte, inArray, isNull, notExists, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { constructionCatalogEntries } from "@/db/schema/construction-core";
import { documentVersions } from "@/db/schema/document-workflow";
import { processDocuments } from "@/db/schema/processes";
import { documents, realEstates } from "@/db/schema/registry";

export async function listConstructionOpeningProperties(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, registration: realEstates.registration, streetName: realEstates.streetName, number: realEstates.number, lot: realEstates.lot, block: realEstates.block, landArea: realEstates.landArea, builtArea: realEstates.builtArea, propertyUse: realEstates.propertyUse, fiscalZone: realEstates.fiscalZone, taxpayerId: realEstates.taxpayerId }).from(realEstates).where(inArray(realEstates.id, ids));
}

export async function listConstructionOpeningCatalogs(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(constructionCatalogEntries).where(and(eq(constructionCatalogEntries.isActive, true), inArray(constructionCatalogEntries.id, ids)));
}

export async function findConstructionOpeningDocumentVersion(db: DatabaseExecutor, documentId: string, unlinked = false) {
  const eligibleDocument = db.select({ id: documents.id }).from(documents).where(and(
    eq(documents.id, documentId),
    inArray(documents.status, ["Válido", "Assinado"]),
    or(isNull(documents.validUntil), gte(documents.validUntil, new Date())),
    unlinked ? notExists(db.select({ id: processDocuments.id }).from(processDocuments).where(eq(processDocuments.documentId, documents.id))) : undefined,
  ));
  return (await db.select({ id: documentVersions.id, status: documentVersions.status, hashSha256: documentVersions.hashSha256 }).from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), exists(eligibleDocument)))
    .orderBy(desc(documentVersions.versionNumber)).limit(1))[0] ?? null;
}
