import assert from "node:assert/strict";
import { config } from "dotenv";
import type { Prisma } from "@prisma/client";
import { createDatabaseConnection } from "../src/db/connection";
import * as registry from "../src/db/repositories/registry/queries";
import { countSupplierRows, loadSupplierRows } from "../src/db/repositories/registry/suppliers";
import { parseSupplierFilters, getSupplierList, getSupplierReportRows } from "../src/app/app-domain/cadastros/fornecedores/supplier-query";
import { dateInputValue, dateOnly } from "../src/app/app-domain/cadastros/fornecedores/supplier-utils";
import type { SupplierFilters, SupplierSourceRow } from "../src/lib/contracts/supplier";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Temporary read-only oracle, copied from the pre-migration query contract.
function legacySupplierWhere(filters: SupplierFilters, reference: Date): Prisma.SupplierWhereInput {
  const conditions: Prisma.SupplierWhereInput[] = [];
  if (filters.query) {
    const query = filters.query;
    const identifier = query.replace(/\D/g, "");
    const search: Prisma.SupplierWhereInput[] = [
      { person: { is: { fullName: { contains: query, mode: "insensitive" } } } },
      { company: { is: { corporateName: { contains: query, mode: "insensitive" } } } },
      { company: { is: { tradeName: { contains: query, mode: "insensitive" } } } },
      { company: { is: { companyType: { contains: query, mode: "insensitive" } } } },
    ];
    if (identifier) search.push({ person: { is: { cpf: { contains: identifier } } } }, { company: { is: { cnpj: { contains: identifier } } } });
    const status = ["Ativo", "Inativo", "Suspenso"].find(value => value.toLocaleLowerCase("pt-BR") === query.toLocaleLowerCase("pt-BR"));
    search.push(status ? { status } : { status: { contains: query, mode: "insensitive" } });
    if (query.replace(/\s/g, "").toUpperCase() === "ME/EPP") search.push({ company: { is: { companyType: { in: ["ME", "EPP"] } } } });
    conditions.push({ OR: search });
  }
  if (filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.classification === "ME" || filters.classification === "EPP") conditions.push({ company: { is: { companyType: filters.classification } } });
  if (filters.classification === "ME_EPP") conditions.push({ company: { is: { companyType: { in: ["ME", "EPP"] } } } });
  const end = (value: Date) => { const result = new Date(value); result.setUTCHours(23, 59, 59, 999); return result; };
  const today = dateOnly(reference)!;
  const thirtyDays = new Date(today); thirtyDays.setUTCDate(thirtyDays.getUTCDate() + 30);
  if (filters.certification === "VENCIDA") conditions.push({ certificationsValidUntil: { lt: today } });
  if (filters.certification === "VENCE_EM_BREVE") conditions.push({ certificationsValidUntil: { gte: today, lte: end(thirtyDays) } });
  if (filters.certification === "VIGENTE") conditions.push({ certificationsValidUntil: { gt: end(thirtyDays) } });
  if (filters.certification === "SEM_VALIDADE") conditions.push({ certificationsValidUntil: null });
  const validFrom = dateOnly(filters.validFrom), validUntil = dateOnly(filters.validUntil);
  if (validFrom || validUntil) conditions.push({ certificationsValidUntil: { ...(validFrom ? { gte: validFrom } : {}), ...(validUntil ? { lte: end(validUntil) } : {}) } });
  return conditions.length ? { AND: conditions } : {};
}

const supplierSelect = {
  id: true, category: true, businessBranch: true, bankData: true, certificationsValidUntil: true, notes: true, status: true,
  person: { select: { fullName: true, cpf: true, documents: { select: { title: true, documentType: true, status: true, validUntil: true }, orderBy: [{ validUntil: "asc" }, { createdAt: "asc" }] } } },
  company: { select: { corporateName: true, tradeName: true, cnpj: true, companyType: true, primaryCnae: true, secondaryCnaes: true, documents: { select: { title: true, documentType: true, status: true, validUntil: true }, orderBy: [{ validUntil: "asc" }, { createdAt: "asc" }] } } },
} satisfies Prisma.SupplierSelect;

function serializeSupplier(row: SupplierSourceRow) {
  const evidence = (document: NonNullable<SupplierSourceRow["person"]>["documents"][number]) => ({ ...document, validUntil: dateInputValue(document.validUntil) || null });
  return { ...row, certificationsValidUntil: dateInputValue(row.certificationsValidUntil) || null,
    person: row.person ? { ...row.person, documents: row.person.documents.map(evidence) } : null,
    company: row.company ? { ...row.company, documents: row.company.documents.map(evidence) } : null,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(url);
  const { db, pool } = createDatabaseConnection(url);
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
    ordered(await registry.listPeople(db), await legacy.person.findMany({ orderBy: { createdAt: "desc" }, include: { taxpayerInfo: true } }), "createdAt", "People");
    ordered(await registry.listCompanies(db), await legacy.company.findMany({ orderBy: { createdAt: "desc" }, include: { taxpayerInfo: true } }), "createdAt", "Companies");
    ordered(await registry.listDocuments(db), await legacy.document.findMany({ orderBy: { createdAt: "desc" }, include: { person: true, company: true } }), "createdAt", "Documents");
    ordered(await registry.listRealEstates(db), await legacy.realEstate.findMany({ orderBy: { createdAt: "desc" }, include: { neighborhood: true, taxpayer: { include: { person: true, company: true } } } }), "createdAt", "Real estate");
    unordered(await registry.listTaxpayerOptions(db), await legacy.taxpayer.findMany({ include: { person: true, company: true } }), "Taxpayer options");
    ordered(await registry.listNeighborhoods(db), await legacy.neighborhood.findMany({ orderBy: { name: "asc" } }), "name", "Neighborhoods");
    unordered(await registry.listPersonOptions(db), await legacy.person.findMany({ select: { id: true, fullName: true, cpf: true } }), "Person options");
    ordered(await registry.listPersonOptions(db, true), await legacy.person.findMany({ select: { id: true, fullName: true, cpf: true }, orderBy: { fullName: "asc" } }), "fullName", "Ordered person options");
    unordered(await registry.listCompanyOptions(db), await legacy.company.findMany({ select: { id: true, corporateName: true, cnpj: true } }), "Company options");
    ordered(await registry.listSupplierCompanyOptions(db), await legacy.company.findMany({ select: { id: true, corporateName: true, cnpj: true, companyType: true, primaryCnae: true, secondaryCnaes: true }, orderBy: { corporateName: "asc" } }), "corporateName", "Supplier company options");
    const reference = new Date("2026-10-28T12:00:00Z");
    const scenarios = [{}, { q: "Ativo" }, { q: "inativo" }, { q: "ME/EPP" }, { q: "materiais" }, { q: "%_" }, { q: "00.000.000/0001" }, { q: "' OR 1=1 --" }, { classification: "ME" }, { classification: "EPP" }, { classification: "ME_EPP", status: "Ativo" }, { certification: "VENCIDA" }, { certification: "VENCE_EM_BREVE" }, { certification: "VIGENTE" }, { certification: "SEM_VALIDADE" }, { validFrom: "2026-10-01", validUntil: "2026-12-31" }, { page: "2" }, { page: "999999" }, { q: "missing-fixture-query" }];
    for (const parameters of scenarios) {
      const filters = parseSupplierFilters(parameters);
      const where = legacySupplierWhere(filters, reference);
      const expected = await legacy.supplier.findMany({ where, select: supplierSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const total = await legacy.supplier.count({ where });
      assert.equal(await countSupplierRows(db, filters, reference), total);
      assert.deepEqual(await loadSupplierRows(db, filters, reference), expected);
      const pageCount = Math.ceil(total / 20), page = total ? Math.min(filters.page, pageCount) : 1;
      assert.deepEqual(await getSupplierList(db, filters, reference), { suppliers: expected.slice((page - 1) * 20, page * 20).map(serializeSupplier), total, page, pageCount });
      assert.deepEqual(await getSupplierReportRows(db, filters, reference), expected.map(serializeSupplier));
      comparisons += 4;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, supplierScenarios: scenarios.length, scope: "Registry complete rows/nullable relations; supplier filters, evidence, count, pagination and CSV source serialization" }, null, 2));
  } finally { await legacy.$disconnect(); await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
