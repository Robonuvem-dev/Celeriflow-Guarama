import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull } from "@/db/json";
import { inspectionActivities, inspectionCredentials } from "@/db/schema/tax-inspection-operations";
import { taxFinancialMappings } from "@/db/schema/tax-accounting";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";
import { nfseEvents } from "@/db/schema/taxation-nfse";
import { taxes } from "@/db/schema/taxation-core";
import { itbiDocumentSequences } from "@/db/schema/tax-itbi";
import { inspectionSnapshot } from "./snapshot";

export function requiredInspectionRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error("Registro não encontrado.");
  return row;
}
export async function inspectionProviderActivities(db: DatabaseExecutor, taxpayerId: string, allowed: string[], registrationId?: string) {
  return db.select({ taxId: inspectionActivities.taxId }).from(inspectionActivities)
    .innerJoin(inspectionCredentials, eq(inspectionCredentials.serviceActivityId, inspectionActivities.id))
    .innerJoin(taxFinancialMappings, and(eq(taxFinancialMappings.taxId, inspectionActivities.taxId), eq(taxFinancialMappings.isActive, true)))
    .innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, taxFinancialMappings.defaultBankAccountId))
    .where(and(eq(inspectionCredentials.taxpayerId, taxpayerId), registrationId ? eq(inspectionCredentials.economicRegistrationId, registrationId) : undefined, eq(inspectionCredentials.status, "HABILITADO"), inArray(reconciliationBankAccounts.budgetUnitId, allowed)));
}
export async function inspectionServiceTaxes(db: DatabaseExecutor, allowed?: string[]) {
  return db.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.isActive, true),
    sql`EXISTS (SELECT 1 FROM ${inspectionActivities} WHERE ${inspectionActivities.taxId}=${taxes.id} AND ${inspectionActivities.isActive}=true)`,
    allowed === undefined ? undefined : sql`EXISTS (SELECT 1 FROM ${taxFinancialMappings} JOIN ${reconciliationBankAccounts} ON ${reconciliationBankAccounts.id}=${taxFinancialMappings.defaultBankAccountId} WHERE ${taxFinancialMappings.taxId}=${taxes.id} AND ${taxFinancialMappings.isActive}=true AND ${reconciliationBankAccounts.budgetUnitId}=ANY(${sql.param(allowed)}::text[]))`));
}
export async function nextInspectionNumber(tx: DatabaseTransaction, type: string, prefix: string) {
  const year = new Date().getUTCFullYear();
  const [row] = await tx.insert(itbiDocumentSequences).values({ year, documentType: type, currentValue: 1 }).onConflictDoUpdate({ target: [itbiDocumentSequences.year, itbiDocumentSequences.documentType], set: { currentValue: sql`${itbiDocumentSequences.currentValue}+1`, updatedAt: new Date() } }).returning({ value: itbiDocumentSequences.currentValue });
  return `${prefix}-${year}-${String(row.value).padStart(7, "0")}`;
}
export async function insertInspectionEvent(tx: DatabaseTransaction, input: Omit<typeof nfseEvents.$inferInsert, "payload"> & { payload?: unknown }) {
  const payload = input.payload === undefined ? undefined : inspectionSnapshot(input.payload);
  return (await tx.insert(nfseEvents).values({ ...input, payload: payload === null ? JsonNull : payload }).returning())[0];
}
