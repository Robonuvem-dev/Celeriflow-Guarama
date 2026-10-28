import { count, desc, asc, eq, getTableColumns, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import * as t from "../../schema/health-management-operations";
import { managementUnitScope } from "./common";

export const readManagementVigilanceRisks = (db: DatabaseExecutor) => db.select({ riskLevel: t.managementVigilanceEstablishments.riskLevel, _count: count() }).from(t.managementVigilanceEstablishments).groupBy(t.managementVigilanceEstablishments.riskLevel);
export const readManagementVigilanceComplaintStatuses = (db: DatabaseExecutor) => db.select({ status: t.managementVigilanceComplaints.status, _count: count() }).from(t.managementVigilanceComplaints).groupBy(t.managementVigilanceComplaints.status);
export const readManagementVigilanceInspectionStatuses = (db: DatabaseExecutor) => db.select({ status: t.managementVigilanceInspections.status, _count: count() }).from(t.managementVigilanceInspections).groupBy(t.managementVigilanceInspections.status);
export const readManagementVigilanceLicenseStatuses = (db: DatabaseExecutor) => db.select({ status: t.managementVigilanceLicenses.status, _count: count() }).from(t.managementVigilanceLicenses).groupBy(t.managementVigilanceLicenses.status);
export const readManagementVigilanceCnaes = (db: DatabaseExecutor) => db.select({ cnae: t.managementVigilanceEstablishments.cnae, _count: count() }).from(t.managementVigilanceEstablishments).groupBy(t.managementVigilanceEstablishments.cnae).orderBy(desc(count(t.managementVigilanceEstablishments.cnae)));
export const readManagementVigilanceEstablishments = (db: DatabaseExecutor) => db.select().from(t.managementVigilanceEstablishments).orderBy(asc(t.managementVigilanceEstablishments.name)).limit(2000);
export async function readManagementVigilanceComplaints(db: DatabaseExecutor) {
  // Reporter identifiers are deliberately excluded from this report projection.
  const rows = await db.select({ createdAt: t.managementVigilanceComplaints.createdAt, place: t.managementVigilanceComplaints.place, description: t.managementVigilanceComplaints.description, isAnonymous: t.managementVigilanceComplaints.isAnonymous, status: t.managementVigilanceComplaints.status, establishment: { name: t.managementVigilanceEstablishments.name } }).from(t.managementVigilanceComplaints).leftJoin(t.managementVigilanceEstablishments, eq(t.managementVigilanceEstablishments.id, t.managementVigilanceComplaints.establishmentId)).orderBy(desc(t.managementVigilanceComplaints.createdAt)).limit(2000);
  return rows;
}
export async function readManagementVigilanceInspections(db: DatabaseExecutor) {
  const rows = await db.select({ inspection: getTableColumns(t.managementVigilanceInspections), establishment: { name: t.managementVigilanceEstablishments.name, cnae: t.managementVigilanceEstablishments.cnae, riskLevel: t.managementVigilanceEstablishments.riskLevel } }).from(t.managementVigilanceInspections).innerJoin(t.managementVigilanceEstablishments, eq(t.managementVigilanceEstablishments.id, t.managementVigilanceInspections.establishmentId)).orderBy(desc(t.managementVigilanceInspections.inspectedAt)).limit(2000);
  const items = rows.length ? await db.select().from(t.managementVigilanceInspectionItems).where(managementUnitScope(t.managementVigilanceInspectionItems.inspectionId, rows.map(r => r.inspection.id))) : [];
  return rows.map(r => ({ ...r.inspection, establishment: r.establishment, items: items.filter(i => i.inspectionId === r.inspection.id) }));
}
export async function readManagementVigilanceLicenses(db: DatabaseExecutor, recordId?: string) {
  const licenses = t.managementVigilanceLicenses;
  const rows = await db.select({ license: getTableColumns(licenses), establishment: getTableColumns(t.managementVigilanceEstablishments) }).from(licenses).innerJoin(t.managementVigilanceEstablishments, eq(t.managementVigilanceEstablishments.id, licenses.establishmentId)).where(recordId ? or(eq(licenses.id, recordId), eq(licenses.licenseNumber, recordId)) : undefined).orderBy(...(recordId ? [] : [desc(licenses.validUntil)])).limit(recordId ? 1 : 2000);
  return rows.map(r => ({ ...r.license, establishment: r.establishment }));
}
