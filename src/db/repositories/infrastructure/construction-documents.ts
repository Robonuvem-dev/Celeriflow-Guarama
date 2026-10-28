import { and, asc, desc, eq, exists, getTableColumns, gte, inArray, isNull, notInArray, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { documentClasses, documentIcpEvidence, documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { processDocuments } from "@/db/schema/processes";
import { users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import type { ConstructionAccess } from "@/lib/contracts/construction";

export async function findConstructionGedVersion(db: DatabaseExecutor, documentVersionId: string) {
  const [row] = await db.select({ ...getTableColumns(documentVersions), documentClass: { signaturePolicy: documentClasses.signaturePolicy } }).from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).where(eq(documentVersions.id, documentVersionId)).limit(1);
  if (!row) throw new Error("DocumentVersion não encontrado.");
  const [signatures, evidence] = await Promise.all([
    db.select().from(documentSignatures).where(eq(documentSignatures.documentVersionId, documentVersionId)),
    db.select().from(documentIcpEvidence).where(eq(documentIcpEvidence.documentVersionId, documentVersionId)).limit(1),
  ]);
  const { documentClass, ...version } = row;
  return { ...version, document: { documentClass }, signatures, icpEvidence: evidence[0] ?? null };
}

export async function listConstructionGedVersions(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  const [versions, signatures] = await Promise.all([
    db.select({ ...getTableColumns(documentVersions), documentClass: { signaturePolicy: documentClasses.signaturePolicy } }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).where(inArray(documentVersions.id, ids)),
    db.select({ documentVersionId: documentSignatures.documentVersionId, signerUsuarioId: documentSignatures.signerUsuarioId, signerName: documentSignatures.signerName, status: documentSignatures.status, provider: documentSignatures.provider }).from(documentSignatures).where(inArray(documentSignatures.documentVersionId, ids)),
  ]);
  return versions.map(({ documentClass, ...version }) => ({ ...version, document: { documentClass }, signatures: signatures.filter(signature => signature.documentVersionId === version.id).map(signature => ({ signerUsuarioId: signature.signerUsuarioId, signerName: signature.signerName, status: signature.status, provider: signature.provider })) }));
}

export async function listConstructionDocumentSigners(db: DatabaseExecutor, access: ConstructionAccess) {
  return db.select({ id: users.id, nome: users.nome }).from(users).leftJoin(employees, eq(employees.id, users.employeeId)).where(and(eq(users.ativo, true), access.administrator ? undefined : eq(employees.departmentId, access.departmentId || ""))).orderBy(asc(users.nome)).limit(100);
}

export function constructionProjectDocumentCondition(db: DatabaseExecutor, processId: string, excludedIds: string[]) {
  return and(notInArray(documents.id, excludedIds), exists(db.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, processId)))), exists(db.select({ id: documentVersions.id }).from(documentVersions).where(and(eq(documentVersions.documentId, documents.id), inArray(documentVersions.status, ["FINAL", "SIGNED"])))));
}

export async function listConstructionProjectDocuments(db: DatabaseExecutor, processId: string, excludedIds: string[], offset: number, limit: number) {
  const rows = await db.select({ id: documents.id, title: documents.title }).from(documents).where(constructionProjectDocumentCondition(db, processId, excludedIds)).orderBy(desc(documents.createdAt)).offset(offset).limit(limit);
  const versions = rows.length ? await db.select({ id: documentVersions.id, documentId: documentVersions.documentId, versionNumber: documentVersions.versionNumber, status: documentVersions.status }).from(documentVersions).where(inArray(documentVersions.documentId, rows.map(row => row.id))).orderBy(desc(documentVersions.versionNumber)) : [];
  return rows.map(row => ({ ...row, versions: versions.filter(version => version.documentId === row.id).slice(0, 1) }));
}

/** Latest version is selected before status validation by each domain caller. */
export async function listConstructionEvidenceDocuments(db: DatabaseExecutor, processId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select({ id: documents.id, title: documents.title }).from(documents).where(and(inArray(documents.id, ids), inArray(documents.status, ["Válido", "Assinado"]), or(isNull(documents.validUntil), gte(documents.validUntil, new Date())), exists(db.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, processId))))));
  const versions = rows.length ? await db.select({ documentId: documentVersions.documentId, id: documentVersions.id, hashSha256: documentVersions.hashSha256, versionNumber: documentVersions.versionNumber, status: documentVersions.status }).from(documentVersions).where(inArray(documentVersions.documentId, rows.map(row => row.id))).orderBy(desc(documentVersions.versionNumber)) : [];
  return rows.map(row => ({ ...row, versions: versions.filter(version => version.documentId === row.id).slice(0, 1).map(version => ({ id: version.id, hashSha256: version.hashSha256, versionNumber: version.versionNumber, status: version.status })) }));
}
