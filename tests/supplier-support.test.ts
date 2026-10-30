import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSupplierIdentity, validateSubmittedSupplierDocument, validateSupplierIdentityDocument } from "../src/app/app-domain/cadastros/fornecedores/supplier-form";
import { buildSupplierWhere, parseSupplierFilters } from "../src/app/app-domain/cadastros/fornecedores/supplier-query";
import { buildSupplierCertificationCsv } from "../src/app/app-domain/cadastros/fornecedores/supplier-report";
import { certificationStatus } from "../src/app/app-domain/cadastros/fornecedores/supplier-utils";
import type { SupplierListItem } from "../src/app/app-domain/cadastros/fornecedores/supplier-types";
import { PgDialect } from "drizzle-orm/pg-core";

test("supplier form keeps PF and PJ identities mutually exclusive and validates the selected document", () => {
  const person = parseSupplierIdentity({ supplierType: "PF", personId: "person-1", companyId: "" });
  assert.deepEqual(person, { supplierType: "PF", personId: "person-1", companyId: null });
  assert.equal(validateSupplierIdentityDocument(person, { cpf: "529.982.247-25" }), "52998224725");

  assert.throws(
    () => parseSupplierIdentity({ supplierType: "PF", personId: "person-1", companyId: "company-1" }),
    /não aceita pessoa jurídica ou CNPJ/,
  );
  assert.throws(
    () => validateSupplierIdentityDocument(parseSupplierIdentity({ supplierType: "PJ", personId: "", companyId: "company-1" }), { cnpj: "00.000.000/0000-00" }),
    /CNPJ inválido/,
  );
  assert.throws(
    () => validateSubmittedSupplierDocument(person, { cnpj: "04.252.011/0001-10" }, "52998224725"),
    /pessoa física não aceita CNPJ/,
  );
  const company = parseSupplierIdentity({ supplierType: "PJ", personId: "", companyId: "company-1" });
  assert.throws(
    () => validateSubmittedSupplierDocument(company, { cpf: "529.982.247-25" }, "04252011000110"),
    /pessoa jurídica não aceita CPF/,
  );
});

test("supplier query combines canonical document search, ME/EPP, status, and certificate filters", () => {
  const filters = parseSupplierFilters({
    q: "12.345.678/0001-90",
    classification: "ME_EPP",
    status: "Ativo",
    certification: "VENCE_EM_BREVE",
    page: "3",
  });
  const where = buildSupplierWhere(filters, new Date("2026-09-01T12:00:00.000Z"));
  assert.ok(where);
  const query = new PgDialect().sqlToQuery(where);

  assert.equal(filters.page, 3);
  assert.ok(query.params.includes("%12345678000190%"));
  assert.match(query.sql, /"Company"\."companyType" in \(\$\d+, \$\d+\)/);
  assert.ok(query.params.includes("ME"));
  assert.ok(query.params.includes("EPP"));
  assert.ok(query.params.includes("Ativo"));
  assert.ok(query.params.includes("2026-09-01T00:00:00.000Z"));
  assert.ok(query.params.includes("2026-10-01T23:59:59.999Z"));
  assert.match(query.sql, /"certificationsValidUntil"/);
});

test("supplier certificate report derives validity without declaring regularity and protects CSV formulas", () => {
  assert.deepEqual(certificationStatus("2026-08-31", "2026-09-01"), { code: "VENCIDA", label: "Vencida em 31/08/2026" });
  assert.deepEqual(certificationStatus("2026-09-20", "2026-09-01"), { code: "VENCE_EM_BREVE", label: "Vence em 20/09/2026" });

  const supplier: SupplierListItem = {
    id: "supplier-1",
    category: "Materiais",
    businessBranch: "Papelaria",
    bankData: null,
    certificationsValidUntil: "2026-09-20",
    notes: null,
    status: "Ativo",
    person: null,
    company: {
      corporateName: "=FORNECEDOR DEMO",
      tradeName: null,
      cnpj: "04252011000110",
      companyType: "ME",
      primaryCnae: "4761-0/03 - Comércio de artigos de papelaria",
      secondaryCnaes: null,
      documents: [],
    },
  };
  const csv = buildSupplierCertificationCsv([supplier], new Date("2026-09-01T12:00:00.000Z"));
  assert.match(csv, /"'=FORNECEDOR DEMO"/);
  assert.match(csv, /"Vence em 20\/09\/2026"/);
});

test("supplier report supports stable alphabetical, numeric document and bank ordering", async () => {
  const { sortSupplierReportRows } = await import("../src/app/app-domain/cadastros/fornecedores/supplier-report");
  const row = (id: string, name: string, cpf: string, bankData: string): SupplierListItem => ({ id, category: null, businessBranch: null, bankData, certificationsValidUntil: null, notes: null, status: "Ativo", person: { fullName: name, cpf, documents: [] }, company: null });
  const rows = [row("a", "Zilda", "002", "Banco 1"), row("b", "Ana", "010", "Banco 9")];
  assert.deepEqual(sortSupplierReportRows(rows, "alfabetica").map(x => x.id), ["b", "a"]);
  assert.deepEqual(sortSupplierReportRows(rows, "numerica").map(x => x.id), ["a", "b"]);
  assert.deepEqual(sortSupplierReportRows(rows, "bancaria").map(x => x.id), ["a", "b"]);
  assert.match(buildSupplierCertificationCsv(rows), /Dados bancários/);
  assert.match(buildSupplierCertificationCsv(rows), /Banco 9/);
  assert.deepEqual(rows.map(x => x.id), ["a", "b"]);
});
