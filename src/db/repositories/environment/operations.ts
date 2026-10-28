import { eq } from "drizzle-orm";
import type { EnvironmentComplaint, EnvironmentComplaintInput, EnvironmentDocument, EnvironmentDocumentInput, EnvironmentEducationProgram, EnvironmentEducationProgramInput, EnvironmentEnterprise, EnvironmentEnterpriseInput, EnvironmentGreenArea, EnvironmentGreenAreaInput, EnvironmentInspection, EnvironmentInspectionInput, EnvironmentLicense, EnvironmentLicenseInput, EnvironmentWaste, EnvironmentWasteInput, IssuedEnvironmentalLicense } from "@/lib/contracts/environment";
import type { DatabaseExecutor } from "../../transaction";
import { PersistenceError } from "../../errors";
import { environmentalComplaints, environmentalDocuments, environmentalEducationPrograms, environmentalEnterprises, environmentalInspections, environmentalLicenses, environmentalWastes, greenAreas, issuedEnvironmentalLicenses } from "../../schema/environment";

function requireRow<T>(rows: T[]): T {
  if (!rows[0]) throw new PersistenceError("not-found", "Registro não encontrado.");
  return rows[0];
}

export async function insertEnterprise(db: DatabaseExecutor, input: EnvironmentEnterpriseInput): Promise<EnvironmentEnterprise> {
  return requireRow(await db.insert(environmentalEnterprises).values(input).returning());
}
export async function updateEnterprise(db: DatabaseExecutor, id: string, input: Partial<EnvironmentEnterpriseInput>): Promise<void> {
  requireRow(await db.update(environmentalEnterprises).set(input).where(eq(environmentalEnterprises.id, id)).returning({ id: environmentalEnterprises.id }));
}
export async function insertLicense(db: DatabaseExecutor, input: EnvironmentLicenseInput & { enterpriseId: string }): Promise<EnvironmentLicense> {
  return requireRow(await db.insert(environmentalLicenses).values(input).returning());
}
export async function updateLicense(db: DatabaseExecutor, id: string, input: Partial<EnvironmentLicenseInput>): Promise<void> {
  requireRow(await db.update(environmentalLicenses).set(input).where(eq(environmentalLicenses.id, id)).returning({ id: environmentalLicenses.id }));
}
export async function deleteLicense(db: DatabaseExecutor, id: string): Promise<void> {
  requireRow(await db.delete(environmentalLicenses).where(eq(environmentalLicenses.id, id)).returning({ id: environmentalLicenses.id }));
}
export async function insertComplaint(db: DatabaseExecutor, input: EnvironmentComplaintInput): Promise<EnvironmentComplaint> {
  return requireRow(await db.insert(environmentalComplaints).values(input).returning());
}
export async function updateComplaint(db: DatabaseExecutor, id: string, input: Pick<EnvironmentComplaint, "status" | "address" | "description">): Promise<void> {
  requireRow(await db.update(environmentalComplaints).set(input).where(eq(environmentalComplaints.id, id)).returning({ id: environmentalComplaints.id }));
}
export async function deleteComplaint(db: DatabaseExecutor, id: string): Promise<void> {
  requireRow(await db.delete(environmentalComplaints).where(eq(environmentalComplaints.id, id)).returning({ id: environmentalComplaints.id }));
}
export async function insertInspection(db: DatabaseExecutor, input: EnvironmentInspectionInput): Promise<EnvironmentInspection> {
  return requireRow(await db.insert(environmentalInspections).values(input).returning());
}
export async function updateInspection(db: DatabaseExecutor, id: string, input: EnvironmentInspectionInput): Promise<void> {
  requireRow(await db.update(environmentalInspections).set(input).where(eq(environmentalInspections.id, id)).returning({ id: environmentalInspections.id }));
}
export async function deleteInspection(db: DatabaseExecutor, id: string): Promise<void> {
  requireRow(await db.delete(environmentalInspections).where(eq(environmentalInspections.id, id)).returning({ id: environmentalInspections.id }));
}
export async function insertGreenArea(db: DatabaseExecutor, input: EnvironmentGreenAreaInput): Promise<EnvironmentGreenArea> {
  return requireRow(await db.insert(greenAreas).values(input).returning());
}
export async function updateGreenArea(db: DatabaseExecutor, id: string, input: Partial<EnvironmentGreenAreaInput>): Promise<void> {
  requireRow(await db.update(greenAreas).set(input).where(eq(greenAreas.id, id)).returning({ id: greenAreas.id }));
}
export async function insertWaste(db: DatabaseExecutor, input: EnvironmentWasteInput): Promise<EnvironmentWaste> {
  return requireRow(await db.insert(environmentalWastes).values(input).returning());
}
export async function updateWaste(db: DatabaseExecutor, id: string, input: EnvironmentWasteInput): Promise<void> {
  requireRow(await db.update(environmentalWastes).set(input).where(eq(environmentalWastes.id, id)).returning({ id: environmentalWastes.id }));
}
export async function deleteWaste(db: DatabaseExecutor, id: string): Promise<void> {
  requireRow(await db.delete(environmentalWastes).where(eq(environmentalWastes.id, id)).returning({ id: environmentalWastes.id }));
}
export async function insertEducationProgram(db: DatabaseExecutor, input: EnvironmentEducationProgramInput): Promise<EnvironmentEducationProgram> {
  return requireRow(await db.insert(environmentalEducationPrograms).values(input).returning());
}
export async function updateEducationProgram(db: DatabaseExecutor, id: string, input: EnvironmentEducationProgramInput): Promise<void> {
  requireRow(await db.update(environmentalEducationPrograms).set(input).where(eq(environmentalEducationPrograms.id, id)).returning({ id: environmentalEducationPrograms.id }));
}
export async function deleteEducationProgram(db: DatabaseExecutor, id: string): Promise<void> {
  requireRow(await db.delete(environmentalEducationPrograms).where(eq(environmentalEducationPrograms.id, id)).returning({ id: environmentalEducationPrograms.id }));
}
export async function insertDocument(db: DatabaseExecutor, input: EnvironmentDocumentInput & { fileUrl: string }): Promise<EnvironmentDocument> {
  return requireRow(await db.insert(environmentalDocuments).values(input).returning());
}
export async function updateDocument(db: DatabaseExecutor, id: string, input: EnvironmentDocumentInput): Promise<void> {
  requireRow(await db.update(environmentalDocuments).set(input).where(eq(environmentalDocuments.id, id)).returning({ id: environmentalDocuments.id }));
}
export async function deleteDocument(db: DatabaseExecutor, id: string): Promise<void> {
  requireRow(await db.delete(environmentalDocuments).where(eq(environmentalDocuments.id, id)).returning({ id: environmentalDocuments.id }));
}
export async function insertIssuedLicense(db: DatabaseExecutor, input: Omit<IssuedEnvironmentalLicense, "id" | "emissaoData" | "createdAt">): Promise<IssuedEnvironmentalLicense> {
  return requireRow(await db.insert(issuedEnvironmentalLicenses).values(input).returning());
}
