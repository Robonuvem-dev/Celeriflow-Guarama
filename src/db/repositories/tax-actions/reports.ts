import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxpayers, companies, realEstates } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { economicRegistrations } from "@/db/schema/taxation-core";

export async function actionTaxpayerReport(database: DatabaseExecutor, query: string) {
  const rows = await database.select({ taxpayer: taxpayers, person: { fullName: people.fullName, cpf: people.cpf }, company: { corporateName: companies.corporateName, cnpj: companies.cnpj }, estates: sql<number>`(SELECT count(*)::integer FROM ${realEstates} WHERE ${realEstates.taxpayerId}=${taxpayers.id})`, registrations: sql<number>`(SELECT count(*)::integer FROM ${economicRegistrations} WHERE ${economicRegistrations.taxpayerId}=${taxpayers.id})` }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(query ? or(ilike(taxpayers.municipalInsc, `%${query}%`), ilike(people.fullName, `%${query}%`), ilike(companies.corporateName, `%${query}%`)) : undefined).orderBy(desc(taxpayers.updatedAt));
  return rows.map(row => ({ ...row.taxpayer, person: row.person, company: row.company, _count: { realEstates: row.estates, economicRegistrations: row.registrations } }));
}
export async function actionEconomicReport(database: DatabaseExecutor, status?: string, regime?: string) {
  const rows = await database.select({ registration: economicRegistrations, person: { fullName: people.fullName, cpf: people.cpf }, company: { corporateName: companies.corporateName, cnpj: companies.cnpj } }).from(economicRegistrations).innerJoin(taxpayers, eq(taxpayers.id, economicRegistrations.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(status ? eq(economicRegistrations.status, status) : undefined, regime ? eq(economicRegistrations.taxRegime, regime) : undefined)).orderBy(desc(economicRegistrations.updatedAt));
  return rows.map(row => ({ ...row.registration, taxpayer: { person: row.person, company: row.company } }));
}
