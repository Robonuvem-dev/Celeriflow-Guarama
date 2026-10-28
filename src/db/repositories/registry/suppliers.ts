import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, like, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { SupplierFilters, SupplierSourceRow } from "@/lib/contracts/supplier";
import { dateOnly } from "@/app/app-domain/cadastros/fornecedores/supplier-utils";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { companies, documents, suppliers } from "../../schema/registry";

function endOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function buildSupplierWhere(filters: SupplierFilters, referenceDate = new Date()): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (filters.query) {
    const query = filters.query;
    const identifier = query.replace(/\D/g, "");
    const search: (SQL | undefined)[] = [ilike(people.fullName, `%${query}%`), ilike(companies.corporateName, `%${query}%`), ilike(companies.tradeName, `%${query}%`), ilike(companies.companyType, `%${query}%`)];
    if (identifier) search.push(like(people.cpf, `%${identifier}%`), like(companies.cnpj, `%${identifier}%`));
    const exactStatus = ["Ativo", "Inativo", "Suspenso"].find(status => status.toLocaleLowerCase("pt-BR") === query.toLocaleLowerCase("pt-BR"));
    search.push(exactStatus ? eq(suppliers.status, exactStatus) : ilike(suppliers.status, `%${query}%`));
    if (query.replace(/\s/g, "").toUpperCase() === "ME/EPP") search.push(inArray(companies.companyType, ["ME", "EPP"]));
    conditions.push(or(...search));
  }
  if (filters.status !== "ALL") conditions.push(eq(suppliers.status, filters.status));
  if (filters.classification === "ME" || filters.classification === "EPP") conditions.push(eq(companies.companyType, filters.classification));
  if (filters.classification === "ME_EPP") conditions.push(inArray(companies.companyType, ["ME", "EPP"]));
  const today = dateOnly(referenceDate) ?? new Date();
  const thirtyDays = new Date(today);
  thirtyDays.setUTCDate(thirtyDays.getUTCDate() + 30);
  if (filters.certification === "VENCIDA") conditions.push(lt(suppliers.certificationsValidUntil, today));
  if (filters.certification === "VENCE_EM_BREVE") conditions.push(and(gte(suppliers.certificationsValidUntil, today), lte(suppliers.certificationsValidUntil, endOfUtcDay(thirtyDays))));
  if (filters.certification === "VIGENTE") conditions.push(gt(suppliers.certificationsValidUntil, endOfUtcDay(thirtyDays)));
  if (filters.certification === "SEM_VALIDADE") conditions.push(isNull(suppliers.certificationsValidUntil));
  const validFrom = dateOnly(filters.validFrom);
  const validUntil = dateOnly(filters.validUntil);
  if (validFrom) conditions.push(gte(suppliers.certificationsValidUntil, validFrom));
  if (validUntil) conditions.push(lte(suppliers.certificationsValidUntil, endOfUtcDay(validUntil)));
  return and(...conditions);
}

export async function countSupplierRows(db: DatabaseExecutor, filters: SupplierFilters, referenceDate: Date): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(suppliers)
    .leftJoin(people, eq(suppliers.personId, people.id)).leftJoin(companies, eq(suppliers.companyId, companies.id)).where(buildSupplierWhere(filters, referenceDate));
  return row.count;
}

export async function loadSupplierRows(db: DatabaseExecutor, filters: SupplierFilters, referenceDate: Date, pagination?: { offset: number; limit: number }): Promise<SupplierSourceRow[]> {
  const query = db.select({
    id: suppliers.id, category: suppliers.category, businessBranch: suppliers.businessBranch, bankData: suppliers.bankData,
    certificationsValidUntil: suppliers.certificationsValidUntil, notes: suppliers.notes, status: suppliers.status,
    person: { id: people.id, fullName: people.fullName, cpf: people.cpf },
    company: { id: companies.id, corporateName: companies.corporateName, tradeName: companies.tradeName, cnpj: companies.cnpj, companyType: companies.companyType, primaryCnae: companies.primaryCnae, secondaryCnaes: companies.secondaryCnaes },
  }).from(suppliers).leftJoin(people, eq(suppliers.personId, people.id)).leftJoin(companies, eq(suppliers.companyId, companies.id))
    .where(buildSupplierWhere(filters, referenceDate)).orderBy(desc(suppliers.createdAt), desc(suppliers.id));
  const rows = await (pagination ? query.limit(pagination.limit).offset(pagination.offset) : query);
  if (!rows.length) return [];
  const personIds = rows.flatMap(row => row.person ? [row.person.id] : []);
  const companyIds = rows.flatMap(row => row.company ? [row.company.id] : []);
  const evidence = personIds.length || companyIds.length ? await db.select({ personId: documents.personId, companyId: documents.companyId,
    document: { title: documents.title, documentType: documents.documentType, status: documents.status, validUntil: documents.validUntil },
  }).from(documents).where(or(personIds.length ? inArray(documents.personId, personIds) : undefined, companyIds.length ? inArray(documents.companyId, companyIds) : undefined))
    .orderBy(asc(documents.validUntil), asc(documents.createdAt)) : [];
  const byPerson = new Map<string, typeof evidence[number]["document"][]>();
  const byCompany = new Map<string, typeof evidence[number]["document"][]>();
  for (const row of evidence) {
    if (row.personId) { const group = byPerson.get(row.personId) ?? []; group.push(row.document); byPerson.set(row.personId, group); }
    if (row.companyId) { const group = byCompany.get(row.companyId) ?? []; group.push(row.document); byCompany.set(row.companyId, group); }
  }
  return rows.map(row => ({
    id: row.id, category: row.category, businessBranch: row.businessBranch, bankData: row.bankData, certificationsValidUntil: row.certificationsValidUntil, notes: row.notes, status: row.status,
    person: row.person ? { fullName: row.person.fullName, cpf: row.person.cpf, documents: byPerson.get(row.person.id) ?? [] } : null,
    company: row.company ? { corporateName: row.company.corporateName, tradeName: row.company.tradeName, cnpj: row.company.cnpj, companyType: row.company.companyType, primaryCnae: row.company.primaryCnae, secondaryCnaes: row.company.secondaryCnaes, documents: byCompany.get(row.company.id) ?? [] } : null,
  }));
}
