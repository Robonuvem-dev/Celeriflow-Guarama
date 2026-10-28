import { desc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { addresses, companies, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { listFiscalProperties, listFiscalRegistrations } from "./lookups";
import { listPageTaxpayers } from "./registry";
import type { TaxpayerDetails, RealEstateRecord, AddressRecord } from "@/lib/contracts/registry";
import type { EconomicRegistrationRow } from "@/lib/contracts/taxation-pages";

export async function readFiscalTaxpayerCard(database: DatabaseExecutor, id: string): Promise<(TaxpayerDetails & { realEstates: RealEstateRecord[]; economicRegistrations: EconomicRegistrationRow[]; taxCaseLinks: { id: string; processId: string | null; purpose: string | null }[] }) | null> {
  const taxpayer = (await listPageTaxpayers(database, { ids: [id], limit: 1 }))[0];
  if (!taxpayer) return null;
  const [properties, registrations, links] = await Promise.all([listFiscalProperties(database, { taxpayerId: id }), listFiscalRegistrations(database, { taxpayerId: id }), database.execute<{ id: string; processId: string | null; purpose: string | null }>(sql`SELECT id,"processId",purpose FROM "TaxCaseLink" WHERE "taxpayerId"=${id}`)]);
  return { ...taxpayer, realEstates: properties, economicRegistrations: registrations, taxCaseLinks: links.rows };
}
export async function readFiscalEconomicCard(database: DatabaseExecutor, id: string): Promise<(EconomicRegistrationRow & { taxpayer: NonNullable<Awaited<ReturnType<typeof readFiscalTaxpayerCard>>> }) | null> {
  const registration = (await listFiscalRegistrations(database, { ids: [id], limit: 1 }))[0];
  if (!registration) return null;
  const taxpayer = await readFiscalTaxpayerCard(database, registration.taxpayerId);
  if (!taxpayer) throw new Error("Contribuinte fiscal não encontrado.");
  return { ...registration, taxpayer };
}
export async function readFiscalPropertyCard(database: DatabaseExecutor, id: string): Promise<(RealEstateRecord & { taxpayer: Awaited<ReturnType<typeof readFiscalTaxpayerCard>> }) | null> {
  const property = (await listFiscalProperties(database, { ids: [id], limit: 1 }))[0];
  if (!property) return null;
  return { ...property, taxpayer: property.taxpayerId ? await readFiscalTaxpayerCard(database, property.taxpayerId) : null };
}
export async function listFiscalPropertyCards(database: DatabaseExecutor, ids?: string[]): Promise<(RealEstateRecord & { taxpayer: TaxpayerDetails | null })[]> {
  const properties = await listFiscalProperties(database, { ids, createdOrder: true });
  const owners = await listPageTaxpayers(database, { ids: properties.flatMap(row => row.taxpayerId ? [row.taxpayerId] : []) });
  return properties.map(row => ({ ...row, taxpayer: owners.find(owner => owner.id === row.taxpayerId) ?? null }));
}
type TaxpayerListRow = Omit<TaxpayerDetails, "person" | "company"> & {
  person: (NonNullable<TaxpayerDetails["person"]> & { addresses: AddressRecord[] }) | null;
  company: (NonNullable<TaxpayerDetails["company"]> & { addresses: AddressRecord[] }) | null;
  _count: { realEstates: number; economicRegistrations: number; taxCaseLinks: number };
};
export async function readFiscalPeoplePage(database: DatabaseExecutor, q: string, page: number): Promise<{ total: number; taxpayers: TaxpayerListRow[] }> {
  const predicate = q ? or(ilike(taxpayers.municipalInsc, `%${q}%`), ilike(people.fullName, `%${q}%`), like(people.cpf, `%${q.replace(/\D/g, "")}%`), ilike(companies.corporateName, `%${q}%`), like(companies.cnpj, `%${q.replace(/[^A-Za-z0-9]/g, "")}%`)) : undefined;
  const [countRows, rows] = await Promise.all([
    database.select({ total: sql<number>`count(*)::integer` }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(predicate),
    database.select({ taxpayer: taxpayers, person: people, company: companies,
      counts: { realEstates: sql<number>`(SELECT count(*)::integer FROM "RealEstate" r WHERE r."taxpayerId"=${taxpayers.id})`, economicRegistrations: sql<number>`(SELECT count(*)::integer FROM "EconomicRegistration" r WHERE r."taxpayerId"=${taxpayers.id})`, taxCaseLinks: sql<number>`(SELECT count(*)::integer FROM "TaxCaseLink" r WHERE r."taxpayerId"=${taxpayers.id})` },
    }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(predicate).orderBy(desc(taxpayers.updatedAt)).offset((page - 1) * 20).limit(20),
  ]);
  const addressRows = await database.select().from(addresses).where(or(inArray(addresses.personId, rows.flatMap(row => row.person ? [row.person.id] : [])), inArray(addresses.companyId, rows.flatMap(row => row.company ? [row.company.id] : []))));
  return { total: countRows[0]?.total ?? 0, taxpayers: rows.map(row => ({ ...row.taxpayer, person: row.person ? { ...row.person, addresses: addressRows.filter(address => address.personId === row.person?.id) } : null, company: row.company ? { ...row.company, addresses: addressRows.filter(address => address.companyId === row.company?.id) } : null, _count: row.counts })) };
}
