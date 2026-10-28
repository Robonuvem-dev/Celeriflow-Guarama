import { asc, desc, eq } from "drizzle-orm";
import type { CompanyRecord, DocumentRecord, NeighborhoodRecord, PersonRecord, RealEstateDetails, TaxpayerDetails, TaxpayerRecord } from "@/lib/contracts/registry";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { companies, documents, realEstates, taxpayers } from "../../schema/registry";
import { neighborhoods } from "../../schema/localities";

export async function listPeople(db: DatabaseExecutor): Promise<(PersonRecord & { taxpayerInfo: TaxpayerRecord | null })[]> {
  const rows = await db.select({ record: people, taxpayerInfo: taxpayers }).from(people)
    .leftJoin(taxpayers, eq(taxpayers.personId, people.id)).orderBy(desc(people.createdAt));
  return rows.map(row => ({ ...row.record, taxpayerInfo: row.taxpayerInfo }));
}

export async function listCompanies(db: DatabaseExecutor): Promise<(CompanyRecord & { taxpayerInfo: TaxpayerRecord | null })[]> {
  const rows = await db.select({ record: companies, taxpayerInfo: taxpayers }).from(companies)
    .leftJoin(taxpayers, eq(taxpayers.companyId, companies.id)).orderBy(desc(companies.createdAt));
  return rows.map(row => ({ ...row.record, taxpayerInfo: row.taxpayerInfo }));
}

export async function listDocuments(db: DatabaseExecutor): Promise<(DocumentRecord & { person: PersonRecord | null; company: CompanyRecord | null })[]> {
  const rows = await db.select({ record: documents, person: people, company: companies }).from(documents)
    .leftJoin(people, eq(documents.personId, people.id)).leftJoin(companies, eq(documents.companyId, companies.id)).orderBy(desc(documents.createdAt));
  return rows.map(row => ({ ...row.record, person: row.person, company: row.company }));
}

export async function listRealEstates(db: DatabaseExecutor): Promise<RealEstateDetails[]> {
  const rows = await db.select({ record: realEstates, neighborhood: neighborhoods, taxpayer: taxpayers, person: people, company: companies }).from(realEstates)
    .leftJoin(neighborhoods, eq(realEstates.neighborhoodId, neighborhoods.id)).leftJoin(taxpayers, eq(realEstates.taxpayerId, taxpayers.id))
    .leftJoin(people, eq(taxpayers.personId, people.id)).leftJoin(companies, eq(taxpayers.companyId, companies.id)).orderBy(desc(realEstates.createdAt));
  return rows.map(row => ({ ...row.record, neighborhood: row.neighborhood, taxpayer: row.taxpayer ? { ...row.taxpayer, person: row.person, company: row.company } : null }));
}

export async function listTaxpayerOptions(db: DatabaseExecutor): Promise<TaxpayerDetails[]> {
  const rows = await db.select({ record: taxpayers, person: people, company: companies }).from(taxpayers)
    .leftJoin(people, eq(taxpayers.personId, people.id)).leftJoin(companies, eq(taxpayers.companyId, companies.id));
  return rows.map(row => ({ ...row.record, person: row.person, company: row.company }));
}

export async function listNeighborhoods(db: DatabaseExecutor): Promise<NeighborhoodRecord[]> {
  return db.select().from(neighborhoods).orderBy(asc(neighborhoods.name));
}

export async function listPersonOptions(db: DatabaseExecutor, ordered = false): Promise<{ id: string; fullName: string; cpf: string | null }[]> {
  const query = db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people);
  return ordered ? query.orderBy(asc(people.fullName)) : query;
}

export async function listCompanyOptions(db: DatabaseExecutor): Promise<{ id: string; corporateName: string; cnpj: string }[]> {
  return db.select({ id: companies.id, corporateName: companies.corporateName, cnpj: companies.cnpj }).from(companies);
}

export async function listSupplierCompanyOptions(db: DatabaseExecutor): Promise<{ id: string; corporateName: string; cnpj: string; companyType: string | null; primaryCnae: string | null; secondaryCnaes: string | null }[]> {
  return db.select({ id: companies.id, corporateName: companies.corporateName, cnpj: companies.cnpj, companyType: companies.companyType, primaryCnae: companies.primaryCnae, secondaryCnaes: companies.secondaryCnaes }).from(companies).orderBy(asc(companies.corporateName));
}
