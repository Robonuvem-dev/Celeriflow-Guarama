import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import type { EnvironmentComplaint, EnvironmentDocument, EnvironmentEducationProgram, EnvironmentEnterprise, EnvironmentGreenArea, EnvironmentInspection, EnvironmentLicense, EnvironmentRequest, EnvironmentWaste, IssuedEnvironmentalLicense } from "@/lib/contracts/environment";
import type { DatabaseExecutor } from "../../transaction";
import { environmentalComplaints, environmentalDocuments, environmentalEducationPrograms, environmentalEnterprises, environmentalInspections, environmentalLicenses, environmentalRequests, environmentalWastes, greenAreas, issuedEnvironmentalLicenses } from "../../schema/environment";

type Filters = Record<string, string | undefined>;

export async function listEnterprises(db: DatabaseExecutor, filters: Filters): Promise<EnvironmentEnterprise[]> {
  return db.select().from(environmentalEnterprises).where(and(
    filters.atividade ? ilike(environmentalEnterprises.activityType, `%${filters.atividade}%`) : undefined,
    filters.risco ? eq(environmentalEnterprises.potentialRisk, filters.risco) : undefined,
    filters.status ? eq(environmentalEnterprises.status, filters.status) : undefined,
  )).orderBy(desc(environmentalEnterprises.createdAt));
}
export async function listEnterpriseOptions(db: DatabaseExecutor): Promise<{ id: string; name: string }[]> {
  return db.select({ id: environmentalEnterprises.id, name: environmentalEnterprises.name }).from(environmentalEnterprises).orderBy(asc(environmentalEnterprises.name));
}
export async function listLicenses(db: DatabaseExecutor, filters: Filters): Promise<(EnvironmentLicense & { enterprise: EnvironmentEnterprise })[]> {
  const rows = await db.select({ record: environmentalLicenses, enterprise: environmentalEnterprises }).from(environmentalLicenses)
    .innerJoin(environmentalEnterprises, eq(environmentalLicenses.enterpriseId, environmentalEnterprises.id))
    .where(filters.status ? eq(environmentalLicenses.status, filters.status) : undefined).orderBy(desc(environmentalLicenses.createdAt));
  return rows.map(row => ({ ...row.record, enterprise: row.enterprise }));
}
export async function listRequests(db: DatabaseExecutor, filters: Filters): Promise<EnvironmentRequest[]> {
  return db.select().from(environmentalRequests).where(and(
    filters.tipo ? ilike(environmentalRequests.requestType, `%${filters.tipo}%`) : undefined,
    filters.status ? eq(environmentalRequests.status, filters.status) : undefined,
  )).orderBy(desc(environmentalRequests.createdAt));
}
export async function listComplaints(db: DatabaseExecutor, filters: Filters): Promise<EnvironmentComplaint[]> {
  return db.select().from(environmentalComplaints).where(and(
    filters.tipo ? ilike(environmentalComplaints.complaintType, `%${filters.tipo}%`) : undefined,
    filters.status ? eq(environmentalComplaints.status, filters.status) : undefined,
  )).orderBy(desc(environmentalComplaints.createdAt));
}
export async function listInspections(db: DatabaseExecutor, filters: Filters): Promise<(EnvironmentInspection & { enterprise: EnvironmentEnterprise | null })[]> {
  const rows = await db.select({ record: environmentalInspections, enterprise: environmentalEnterprises }).from(environmentalInspections)
    .leftJoin(environmentalEnterprises, eq(environmentalInspections.enterpriseId, environmentalEnterprises.id))
    .where(filters.status ? eq(environmentalInspections.status, filters.status) : undefined).orderBy(desc(environmentalInspections.dateScheduled));
  return rows.map(row => ({ ...row.record, enterprise: row.enterprise }));
}
export async function listGreenAreas(db: DatabaseExecutor, filters: Filters): Promise<EnvironmentGreenArea[]> {
  return db.select().from(greenAreas).where(filters.status ? eq(greenAreas.status, filters.status) : undefined).orderBy(asc(greenAreas.name));
}
export async function listWastes(db: DatabaseExecutor, filters: Filters): Promise<(EnvironmentWaste & { enterprise: EnvironmentEnterprise | null })[]> {
  const rows = await db.select({ record: environmentalWastes, enterprise: environmentalEnterprises }).from(environmentalWastes)
    .leftJoin(environmentalEnterprises, eq(environmentalWastes.enterpriseId, environmentalEnterprises.id))
    .where(filters.tipo ? ilike(environmentalWastes.wasteType, `%${filters.tipo}%`) : undefined).orderBy(desc(environmentalWastes.date));
  return rows.map(row => ({ ...row.record, enterprise: row.enterprise }));
}
export async function listEducationPrograms(db: DatabaseExecutor, filters: Filters): Promise<EnvironmentEducationProgram[]> {
  return db.select().from(environmentalEducationPrograms).where(filters.status ? eq(environmentalEducationPrograms.status, filters.status) : undefined).orderBy(desc(environmentalEducationPrograms.startDate));
}
export async function listDocuments(db: DatabaseExecutor, filters: Filters): Promise<(EnvironmentDocument & { enterprise: EnvironmentEnterprise | null })[]> {
  const rows = await db.select({ record: environmentalDocuments, enterprise: environmentalEnterprises }).from(environmentalDocuments)
    .leftJoin(environmentalEnterprises, eq(environmentalDocuments.enterpriseId, environmentalEnterprises.id))
    .where(filters.tipo ? eq(environmentalDocuments.docType, filters.tipo) : undefined).orderBy(desc(environmentalDocuments.createdAt));
  return rows.map(row => ({ ...row.record, enterprise: row.enterprise }));
}
export async function listIssuedLicenses(db: DatabaseExecutor): Promise<IssuedEnvironmentalLicense[]> {
  return db.select().from(issuedEnvironmentalLicenses).orderBy(desc(issuedEnvironmentalLicenses.createdAt)).limit(15);
}
export async function getEnvironmentTotals(db: DatabaseExecutor): Promise<{ totalEnterprises: number; totalLicenses: number; totalComplaints: number; totalGreenAreas: number }> {
  const [enterprises, licenses, complaints, areas] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(environmentalEnterprises),
    db.select({ count: sql<number>`count(*)::int` }).from(environmentalLicenses),
    db.select({ count: sql<number>`count(*)::int` }).from(environmentalComplaints),
    db.select({ count: sql<number>`count(*)::int` }).from(greenAreas),
  ]);
  return { totalEnterprises: enterprises[0].count, totalLicenses: licenses[0].count, totalComplaints: complaints[0].count, totalGreenAreas: areas[0].count };
}
