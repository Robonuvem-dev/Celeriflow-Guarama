import assert from "node:assert/strict";
import { config } from "dotenv";
import * as registry from "../src/db/repositories/registry/queries";
import { countSupplierRows, loadSupplierRows } from "../src/db/repositories/registry/suppliers";
import { parseSupplierFilters, getSupplierList, getSupplierReportRows } from "../src/app/app-domain/cadastros/fornecedores/supplier-query";
import type { SupplierFilters, SupplierSourceRow } from "../src/lib/contracts/supplier";
import type { CompanyRecord, DocumentRecord, NeighborhoodRecord, PersonRecord, RealEstateRecord, TaxpayerRecord } from "../src/lib/contracts/registry";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const dateInputValue = (date: Date | null) => date?.toISOString().slice(0, 10) || "";
const dateOnly = (value: Date | string) => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) : null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date : null;
};

// Captured supplier predicate expressed in PostgreSQL, not a client-shaped API.
function supplierPredicate(filters: SupplierFilters, reference: Date) {
  const conditions: string[] = [], values: unknown[] = [];
  const parameter = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (filters.query) {
    const query = filters.query;
    const identifier = query.replace(/\D/g, "");
    const pattern = parameter(`%${query}%`);
    const search = [`p."fullName" ILIKE ${pattern}`, `c."corporateName" ILIKE ${pattern}`, `c."tradeName" ILIKE ${pattern}`, `c."companyType" ILIKE ${pattern}`];
    if (identifier) { const digits = parameter(`%${identifier}%`); search.push(`p.cpf LIKE ${digits}`, `c.cnpj LIKE ${digits}`); }
    const status = ["Ativo", "Inativo", "Suspenso"].find(value => value.toLocaleLowerCase("pt-BR") === query.toLocaleLowerCase("pt-BR"));
    search.push(status ? `s.status=${parameter(status)}` : `s.status ILIKE ${pattern}`);
    if (query.replace(/\s/g, "").toUpperCase() === "ME/EPP") search.push(`c."companyType" IN ('ME','EPP')`);
    conditions.push(`(${search.join(" OR ")})`);
  }
  if (filters.status !== "ALL") conditions.push(`s.status=${parameter(filters.status)}`);
  if (filters.classification === "ME" || filters.classification === "EPP") conditions.push(`c."companyType"=${parameter(filters.classification)}`);
  if (filters.classification === "ME_EPP") conditions.push(`c."companyType" IN ('ME','EPP')`);
  const end = (value: Date) => { const result = new Date(value); result.setUTCHours(23, 59, 59, 999); return result; };
  const today = dateOnly(reference)!;
  const thirtyDays = new Date(today); thirtyDays.setUTCDate(thirtyDays.getUTCDate() + 30);
  if (filters.certification === "VENCIDA") conditions.push(`s."certificationsValidUntil"<${parameter(today)}::timestamp`);
  if (filters.certification === "VENCE_EM_BREVE") conditions.push(`s."certificationsValidUntil">=${parameter(today)}::timestamp AND s."certificationsValidUntil"<=${parameter(end(thirtyDays))}::timestamp`);
  if (filters.certification === "VIGENTE") conditions.push(`s."certificationsValidUntil">${parameter(end(thirtyDays))}::timestamp`);
  if (filters.certification === "SEM_VALIDADE") conditions.push('s."certificationsValidUntil" IS NULL');
  const validFrom = dateOnly(filters.validFrom), validUntil = dateOnly(filters.validUntil);
  if (validFrom) conditions.push(`s."certificationsValidUntil">=${parameter(validFrom)}::timestamp`);
  if (validUntil) conditions.push(`s."certificationsValidUntil"<=${parameter(end(validUntil))}::timestamp`);
  return { where: conditions.length ? conditions.join(" AND ") : "TRUE", values };
}

function serializeSupplier(row: SupplierSourceRow) {
  const evidence = (document: NonNullable<SupplierSourceRow["person"]>["documents"][number]) => ({ ...document, validUntil: dateInputValue(document.validUntil) || null });
  return { ...row, certificationsValidUntil: dateInputValue(row.certificationsValidUntil) || null,
    person: row.person ? { ...row.person, documents: row.person.documents.map(evidence) } : null,
    company: row.company ? { ...row.company, documents: row.company.documents.map(evidence) } : null,
  };
}

async function main() {
  const oracle = openReadOnlySqlOracle(sqlOracleUrl()), { db, pool } = oracle;
  let comparisons = 0;
  function unordered<T extends { id: string }>(actual: T[], expected: T[], name: string) {
    assert.deepEqual([...actual].sort((a, b) => a.id.localeCompare(b.id)), [...expected].sort((a, b) => a.id.localeCompare(b.id)), name);
    comparisons++;
  }
  function ordered<T extends { id: string }>(actual: T[], expected: T[], key: keyof T, name: string) {
    assert.deepEqual(actual.map(row => row[key]), expected.map(row => row[key]), `${name}: primary ordering`);
    unordered(actual, expected, `${name}: complete rows`);
  }
  try {
    const people = await oracle.rows<PersonRecord>('SELECT * FROM "Person" ORDER BY "createdAt" DESC');
    const companies = await oracle.rows<CompanyRecord>('SELECT * FROM "Company" ORDER BY "createdAt" DESC');
    const taxpayers = await oracle.rows<TaxpayerRecord>('SELECT * FROM "Taxpayer"');
    const documents = await oracle.rows<DocumentRecord>('SELECT * FROM "Document" ORDER BY "createdAt" DESC');
    const neighborhoods = await oracle.rows<NeighborhoodRecord>('SELECT * FROM "Neighborhood" ORDER BY name ASC');
    const person = (id: string | null) => people.find(row => row.id === id) ?? null;
    const company = (id: string | null) => companies.find(row => row.id === id) ?? null;
    const taxpayerDetails = taxpayers.map(row => ({ ...row, person: person(row.personId), company: company(row.companyId) }));
    ordered(await registry.listPeople(db), people.map(row => ({ ...row, taxpayerInfo: taxpayers.find(item => item.personId === row.id) ?? null })), "createdAt", "People");
    ordered(await registry.listCompanies(db), companies.map(row => ({ ...row, taxpayerInfo: taxpayers.find(item => item.companyId === row.id) ?? null })), "createdAt", "Companies");
    ordered(await registry.listDocuments(db), documents.map(row => ({ ...row, person: person(row.personId), company: company(row.companyId) })), "createdAt", "Documents");
    const estates = await oracle.rows<RealEstateRecord>('SELECT * FROM "RealEstate" ORDER BY "createdAt" DESC');
    ordered(await registry.listRealEstates(db), estates.map(row => ({ ...row, neighborhood: neighborhoods.find(item => item.id === row.neighborhoodId) ?? null, taxpayer: taxpayerDetails.find(item => item.id === row.taxpayerId) ?? null })), "createdAt", "Real estate");
    unordered(await registry.listTaxpayerOptions(db), taxpayerDetails, "Taxpayer options");
    ordered(await registry.listNeighborhoods(db), neighborhoods, "name", "Neighborhoods");
    unordered(await registry.listPersonOptions(db), people.map(({ id, fullName, cpf }) => ({ id, fullName, cpf })), "Person options");
    ordered(await registry.listPersonOptions(db, true), await oracle.rows<{ id: string; fullName: string; cpf: string | null }>('SELECT id,"fullName",cpf FROM "Person" ORDER BY "fullName" ASC'), "fullName", "Ordered person options");
    unordered(await registry.listCompanyOptions(db), companies.map(({ id, corporateName, cnpj }) => ({ id, corporateName, cnpj })), "Company options");
    ordered(await registry.listSupplierCompanyOptions(db), await oracle.rows<Pick<CompanyRecord, "id" | "corporateName" | "cnpj" | "companyType" | "primaryCnae" | "secondaryCnaes">>('SELECT id,"corporateName",cnpj,"companyType","primaryCnae","secondaryCnaes" FROM "Company" ORDER BY "corporateName" ASC'), "corporateName", "Supplier company options");
    const evidence = await oracle.rows<Pick<DocumentRecord, "title" | "documentType" | "status" | "validUntil" | "personId" | "companyId">>('SELECT title,"documentType",status,"validUntil","personId","companyId" FROM "Document" ORDER BY "validUntil" ASC,"createdAt" ASC');
    const evidenceFor = (key: "personId" | "companyId", id: string) => evidence.filter(row => row[key] === id).map(({ title, documentType, status, validUntil }) => ({ title, documentType, status, validUntil }));
    const reference = new Date("2026-10-28T12:00:00Z");
    const scenarios = [{}, { q: "Ativo" }, { q: "inativo" }, { q: "ME/EPP" }, { q: "materiais" }, { q: "%_" }, { q: "00.000.000/0001" }, { q: "' OR 1=1 --" }, { classification: "ME" }, { classification: "EPP" }, { classification: "ME_EPP", status: "Ativo" }, { certification: "VENCIDA" }, { certification: "VENCE_EM_BREVE" }, { certification: "VIGENTE" }, { certification: "SEM_VALIDADE" }, { validFrom: "2026-10-01", validUntil: "2026-12-31" }, { page: "2" }, { page: "999999" }, { q: "missing-fixture-query" }];
    for (const parameters of scenarios) {
      const filters = parseSupplierFilters(parameters);
      const { where, values } = supplierPredicate(filters, reference);
      const from = `FROM "Supplier" s LEFT JOIN "Person" p ON p.id=s."personId" LEFT JOIN "Company" c ON c.id=s."companyId" WHERE ${where}`;
      const source = await oracle.rows<Omit<SupplierSourceRow, "person" | "company"> & { personId: string | null; companyId: string | null }>(`SELECT s.id,s.category,s."businessBranch",s."bankData",s."certificationsValidUntil",s.notes,s.status,s."personId",s."companyId" ${from} ORDER BY s."createdAt" DESC,s.id DESC`, values);
      const expected: SupplierSourceRow[] = source.map(({ personId, companyId, ...row }) => {
        const p = person(personId), c = company(companyId);
        return { ...row, person: p ? { fullName: p.fullName, cpf: p.cpf, documents: evidenceFor("personId", p.id) } : null, company: c ? { corporateName: c.corporateName, tradeName: c.tradeName, cnpj: c.cnpj, companyType: c.companyType, primaryCnae: c.primaryCnae, secondaryCnaes: c.secondaryCnaes, documents: evidenceFor("companyId", c.id) } : null };
      });
      const total = await oracle.count(`SELECT count(*)::int AS count ${from}`, values);
      assert.equal(await countSupplierRows(db, filters, reference), total);
      assert.deepEqual(await loadSupplierRows(db, filters, reference), expected);
      const pageCount = Math.ceil(total / 20), page = total ? Math.min(filters.page, pageCount) : 1;
      assert.deepEqual(await getSupplierList(db, filters, reference), { suppliers: expected.slice((page - 1) * 20, page * 20).map(serializeSupplier), total, page, pageCount });
      assert.deepEqual(await getSupplierReportRows(db, filters, reference), expected.map(serializeSupplier));
      comparisons += 4;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, supplierScenarios: scenarios.length, scope: "Registry complete rows/nullable relations; supplier filters, evidence, count, pagination and CSV source serialization" }, null, 2));
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
