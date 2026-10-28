import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { loadDirectContracting, loadDirectContractingOptions } from "../src/db/repositories/procurement/direct-contracting";

test("direct contracting readers preserve PF/PJ identities and absent joined records", async () => {
  const f = await createProcurementWorkflowFixture();
  try {
    await f.database.exec(`
      CREATE TABLE "Company" (id text PRIMARY KEY, "corporateName" text NOT NULL, "tradeName" text, cnpj text NOT NULL UNIQUE, "municipalInsc" text, "stateInsc" text, "companyType" text, "legalNature" text, "primaryCnae" text, "secondaryCnaes" text, "openingDate" timestamp, "taxRegime" text, status text NOT NULL DEFAULT 'Ativo', phone text, whatsapp text, "emailPrimary" text, "emailFiscal" text, website text, "contactPerson" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "Person" (id text PRIMARY KEY, "fullName" text NOT NULL);
      ALTER TABLE "Supplier" ADD COLUMN category text, ADD COLUMN "businessBranch" text, ADD COLUMN "bankData" text, ADD COLUMN "certificationsValidUntil" timestamp, ADD COLUMN notes text, ADD COLUMN "personId" text UNIQUE REFERENCES "Person", ADD COLUMN "companyId" text UNIQUE REFERENCES "Company", ADD COLUMN "createdAt" timestamp NOT NULL DEFAULT now(), ADD COLUMN "updatedAt" timestamp NOT NULL DEFAULT now();
      CREATE TABLE "DirectContracting" (id text PRIMARY KEY, type text NOT NULL, justification text NOT NULL, value float8 NOT NULL, status text NOT NULL DEFAULT 'Em Elaboração', "processId" text NOT NULL REFERENCES "PurchaseProcess", "supplierId" text NOT NULL REFERENCES "Supplier", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      INSERT INTO "Person" VALUES ('pf-person', 'Fornecedor pessoa física');
      INSERT INTO "Company" (id, "corporateName", "tradeName", cnpj) VALUES ('pj-company', 'Fornecedor pessoa jurídica', 'PJ Comercial', '00000000000001');
      INSERT INTO "Supplier" (id, "personId", "companyId") VALUES ('pf', 'pf-person', NULL), ('pj', NULL, 'pj-company');
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId", "estimatedValue") VALUES ('proc', 'PROC', 'Serviços municipais', 'Comum', 'secretaria', 0.30);
      INSERT INTO "DirectContracting" (id, type, justification, value, "processId", "supplierId") VALUES ('direct-pf', 'Dispensa', 'Justificativa PF', 0.30, 'proc', 'pf'), ('direct-pj', 'Inexigibilidade', 'Justificativa PJ', 0.30, 'proc', 'pj');
    `);
    const db = f.connection.db;
    const options = await loadDirectContractingOptions(db);
    assert.equal(options.processos[0].estimatedValue, 0.30);
    const pf = options.fornecedores.find(supplier => supplier.id === "pf");
    assert.ok(pf);
    assert.equal(pf.company, null);
    assert.equal(pf.person?.fullName, "Fornecedor pessoa física");
    const pj = options.fornecedores.find(supplier => supplier.id === "pj");
    assert.ok(pj);
    assert.equal(pj.person, null);
    assert.equal(pj.company?.tradeName, "PJ Comercial");
    const legacy = options.fornecedores.find(supplier => supplier.id === "fornecedor");
    assert.ok(legacy);
    assert.equal(legacy.person, null);
    assert.equal(legacy.company, null);
    assert.equal((await loadDirectContracting(db, "direct-pf"))?.supplier.person?.fullName, "Fornecedor pessoa física");
    assert.equal((await loadDirectContracting(db, "direct-pj"))?.supplier.company?.corporateName, "Fornecedor pessoa jurídica");
    assert.equal(await loadDirectContracting(db, "absent"), null);
  } finally { await f.close(); }
});
