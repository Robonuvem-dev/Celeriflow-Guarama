import { desc, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxLicenses } from "@/db/schema/taxation-registry";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { pageActiveDebts, pageTaxCertificates } from "@/db/schema/taxation-pages";
import { listPageTaxpayers } from "./registry";
import type { ActiveDebtDetails, CertificateDetails, EconomicRegistrationDetails, LicenseDetails } from "@/lib/contracts/taxation-pages";

export async function readTaxationDashboard(database: DatabaseExecutor): Promise<{ taxpayersCount: number; guidesCount: number; economyCount: number; paidTotal: string | null }> {
  const result = await database.execute<{ taxpayersCount: number; guidesCount: number; economyCount: number; paidTotal: string | null }>(sql`SELECT
    (SELECT count(*)::integer FROM "Taxpayer") AS "taxpayersCount",
    (SELECT count(*)::integer FROM "TaxGuide") AS "guidesCount",
    (SELECT count(*)::integer FROM "EconomicRegistration") AS "economyCount",
    (SELECT sum("amountPaidDecimal")::text FROM "TaxPayment" WHERE status='Confirmado') AS "paidTotal"`);
  return result.rows[0];
}

export async function listLicensePageRows(database: DatabaseExecutor, ids?: string[]): Promise<LicenseDetails[]> {
  const rows = await database.select().from(taxLicenses).where(ids === undefined ? undefined : inArray(taxLicenses.id, ids)).orderBy(desc(taxLicenses.createdAt));
  const taxpayers = new Map((await listPageTaxpayers(database, { ids: rows.map(row => row.taxpayerId) })).map(row => [row.id, row]));
  return rows.map(row => ({ ...row, taxpayer: requiredTaxpayer(taxpayers, row.taxpayerId) }));
}
export async function listCertificatePageRows(database: DatabaseExecutor): Promise<CertificateDetails[]> {
  const rows = await database.select().from(pageTaxCertificates).orderBy(desc(pageTaxCertificates.createdAt));
  const taxpayers = new Map((await listPageTaxpayers(database, { ids: rows.map(row => row.taxpayerId) })).map(row => [row.id, row]));
  return rows.map(row => ({ ...row, taxpayer: requiredTaxpayer(taxpayers, row.taxpayerId) }));
}
export async function listDebtPageRows(database: DatabaseExecutor): Promise<ActiveDebtDetails[]> {
  const rows = await database.select().from(pageActiveDebts).orderBy(desc(pageActiveDebts.createdAt));
  const taxpayers = new Map((await listPageTaxpayers(database, { ids: rows.map(row => row.taxpayerId) })).map(row => [row.id, row]));
  return rows.map(row => ({ ...row, taxpayer: requiredTaxpayer(taxpayers, row.taxpayerId) }));
}
export async function listEconomicPageRows(database: DatabaseExecutor): Promise<EconomicRegistrationDetails[]> {
  const rows = await database.select().from(economicRegistrations).orderBy(desc(economicRegistrations.createdAt));
  const taxpayers = new Map((await listPageTaxpayers(database, { ids: rows.map(row => row.taxpayerId) })).map(row => [row.id, row]));
  return rows.map(row => ({ ...row, taxpayer: requiredTaxpayer(taxpayers, row.taxpayerId) }));
}
function requiredTaxpayer(taxpayers: Map<string, Awaited<ReturnType<typeof listPageTaxpayers>>[number]>, id: string) {
  const taxpayer = taxpayers.get(id);
  if (!taxpayer) throw new Error("Contribuinte fiscal não encontrado.");
  return taxpayer;
}
