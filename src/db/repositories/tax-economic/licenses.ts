import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { taxLicenses } from "@/db/schema/taxation-registry";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { economicSignatureEvidence } from "@/db/schema/tax-economic";
import type { EconomicDocumentVersion, EconomicLicenseCreate, EconomicLicenseRecord, EconomicSignatureEvidence } from "@/lib/contracts/tax-economic";

export async function lockEconomicLicense(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.select({ id: taxLicenses.id }).from(taxLicenses).where(eq(taxLicenses.id, id)).for("update");
}
export async function readEconomicLicense(db: DatabaseExecutor, id: string): Promise<EconomicLicenseRecord> {
  const [row] = await db.select().from(taxLicenses).where(eq(taxLicenses.id, id)).limit(1);
  if (!row) throw new Error("Alvará não encontrado.");
  return row;
}
export async function readEconomicLicenseByCode(db: DatabaseExecutor, code: string): Promise<EconomicLicenseRecord> {
  const [row] = await db.select().from(taxLicenses).where(eq(taxLicenses.qrCode, code)).limit(1);
  if (!row) throw new Error("Alvará não encontrado.");
  return row;
}
export async function countUncancelledEconomicLicenses(db: DatabaseExecutor, ids: string[]): Promise<number> {
  return (await db.select({ value: count() }).from(taxLicenses).where(and(inArray(taxLicenses.id, ids), ne(taxLicenses.status, "Cancelado"))))[0].value;
}
export async function insertEconomicLicense(tx: DatabaseTransaction, input: EconomicLicenseCreate): Promise<EconomicLicenseRecord> {
  return (await tx.insert(taxLicenses).values(input).returning())[0];
}
export async function changeEconomicLicenseStatus(tx: DatabaseTransaction, id: string, status: string): Promise<EconomicLicenseRecord> {
  const [row] = await tx.update(taxLicenses).set({ status, updatedAt: new Date() }).where(eq(taxLicenses.id, id)).returning();
  if (!row) throw new Error("Alvará não encontrado.");
  return row;
}
export async function readFirstEconomicDocumentVersion(db: DatabaseExecutor, documentId: string): Promise<EconomicDocumentVersion> {
  const [row] = await db.select().from(documentVersions).where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.versionNumber, 1))).limit(1);
  if (!row) throw new Error("Versão documental não encontrada.");
  return row;
}
export async function readSignedEconomicDocumentVersion(db: DatabaseExecutor, id: string, documentId: string): Promise<EconomicDocumentVersion & { icpEvidence: EconomicSignatureEvidence | null }> {
  const [row] = await db.select({ version: documentVersions, evidence: economicSignatureEvidence }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(economicSignatureEvidence, eq(economicSignatureEvidence.documentVersionId, documentVersions.id)).where(and(eq(documentVersions.id, id), eq(documentVersions.documentId, documentId), eq(documentVersions.status, "SIGNED"), eq(documents.status, "Assinado"))).limit(1);
  if (!row) throw new Error("Original assinado não encontrado.");
  return { ...row.version, icpEvidence: row.evidence };
}
