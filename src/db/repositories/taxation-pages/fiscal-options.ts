import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxes } from "@/db/schema/taxation-core";
import { pageActivities, pageParameters, pageValuations, pageSigningCertificates } from "@/db/schema/taxation-pages";
import type { JsonValue } from "@/db/json";
import type { PropertyValuationRow, ServiceActivityRow, TaxParameterRow, TaxRow } from "@/lib/contracts/taxation-pages";

export async function listPageServiceActivities(database: DatabaseExecutor, issOnly = false): Promise<(ServiceActivityRow & { tax: TaxRow })[]> {
  const rows = await database.select({ activity: pageActivities, tax: taxes }).from(pageActivities).innerJoin(taxes, eq(taxes.id, pageActivities.taxId)).where(and(eq(pageActivities.isActive, true), issOnly ? sql`lower(${taxes.name})=lower('ISS')` : undefined)).orderBy(asc(pageActivities.code));
  return rows.map(row => ({ ...row.activity, tax: row.tax }));
}
export async function listPageParameters(database: DatabaseExecutor, limit: number, effectiveOrder = false): Promise<(TaxParameterRow & { tax: TaxRow })[]> {
  const query = database.select({ parameter: pageParameters, tax: taxes }).from(pageParameters).innerJoin(taxes, eq(taxes.id, pageParameters.taxId)).limit(limit).$dynamic();
  if (effectiveOrder) query.orderBy(desc(pageParameters.effectiveFrom), desc(pageParameters.createdAt)); else query.orderBy(desc(pageParameters.createdAt));
  return (await query).map(row => ({ ...row.parameter, tax: row.tax }));
}
export async function listPageValuations(database: DatabaseExecutor): Promise<PropertyValuationRow[]> {
  return database.select().from(pageValuations).orderBy(desc(pageValuations.year));
}
export async function listPageValuationTaxes(database: DatabaseExecutor): Promise<{ id: string; name: string; financialMapping: { defaultBankAccount: { budgetUnitId: string | null } } | null }[]> {
  // Keep the outer reference qualified: Drizzle unqualifies top-level select
  // columns, including column objects interpolated inside scalar subqueries.
  const rows = await database.select({ ...getTableColumns(taxes), mappingId: sql<string | null>`(SELECT m.id FROM "TaxFinancialMapping" m WHERE m."taxId"="Tax"."id")`, budgetUnitId: sql<string | null>`(SELECT b."budgetUnitId" FROM "TaxFinancialMapping" m JOIN "BankAccount" b ON b.id=m."defaultBankAccountId" WHERE m."taxId"="Tax"."id")` }).from(taxes).where(and(eq(taxes.isActive, true), sql`lower(${taxes.name}) IN ('iptu','itbi')`));
  return rows.map(({ mappingId, budgetUnitId, ...tax }) => ({ ...tax, financialMapping: mappingId ? { defaultBankAccount: { budgetUnitId } } : null }));
}
export async function listPageCbos(database: DatabaseExecutor): Promise<{ code: string; description: string }[]> {
  return (await database.execute<{ code: string; description: string }>(sql`SELECT code,description FROM "HealthCbo" WHERE "isActive"=true ORDER BY code ASC`)).rows;
}
export async function listPageSigningCertificates(database: DatabaseExecutor): Promise<{ id: string; alias: string; ownerName: string; purposes: JsonValue }[]> {
  const from = new Date(); const to = new Date();
  return database.select({ id: pageSigningCertificates.id, alias: pageSigningCertificates.alias, ownerName: pageSigningCertificates.ownerName, purposes: pageSigningCertificates.purposes }).from(pageSigningCertificates).where(sql`${pageSigningCertificates.status}='ACTIVE' AND ${pageSigningCertificates.validFrom} <= ${from} AND ${pageSigningCertificates.validTo} >= ${to}`);
}
