import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { readCanonicalIdentityIssues } from "../src/lib/cadastros/identity-integrity";

test("Identidades: verifica cadeias reais por registro, documentos normalizados e preserva cadastros", async () => {
  const pg = new PGlite();
  try {
    // Deliberately permit conflicting historical roles, as the original fixture
    // did, so the real reader can detect every integrity issue without writes.
    await pg.exec(`CREATE TABLE "Person" (id TEXT PRIMARY KEY,"fullName" TEXT,cpf TEXT);
      CREATE TABLE "Company" (id TEXT PRIMARY KEY,"corporateName" TEXT,cnpj TEXT);
      CREATE TABLE "Taxpayer" (id TEXT PRIMARY KEY,"taxpayerType" TEXT,"personId" TEXT,"companyId" TEXT);
      CREATE TABLE "Supplier" (id TEXT PRIMARY KEY,"personId" TEXT,"companyId" TEXT);
      CREATE TABLE "Creditor" (id TEXT PRIMARY KEY,name TEXT,"personId" TEXT,"companyId" TEXT,"supplierId" TEXT,document TEXT);
      INSERT INTO "Person" VALUES ('canonical-person','Pessoa da fixture','52998224725'),('duplicate-document','Outra identidade','529.982.247-25');
      INSERT INTO "Company" VALUES ('canonical-company','Empresa da fixture','11222333000181');
      INSERT INTO "Taxpayer" VALUES ('taxpayer-wrong-type','PJ','canonical-person',NULL),('taxpayer-ambiguous','PF','duplicate-document','canonical-company'),('taxpayer-missing','PF',NULL,NULL);
      INSERT INTO "Supplier" VALUES ('supplier-person','canonical-person',NULL),('supplier-duplicate','canonical-person',NULL);
      INSERT INTO "Creditor" VALUES ('creditor-conflict','Credor da fixture',NULL,'canonical-company','supplier-person','52998224725');`);
    const before = (await pg.query('SELECT * FROM "Creditor" WHERE id=$1', ["creditor-conflict"])).rows;
    const issues = await readCanonicalIdentityIssues(drizzle(pg) as unknown as DatabaseExecutor);
    const has = (id: string, type: string) => issues.some(issue => issue.recordId === id && issue.issueType === type);
    assert.ok(has("canonical-person", "CANONICAL_DOCUMENT_DUPLICATE"));
    assert.ok(has("taxpayer-wrong-type", "TAXPAYER_IDENTITY_TYPE_MISMATCH"));
    assert.ok(has("taxpayer-ambiguous", "CANONICAL_IDENTITY_AMBIGUOUS"));
    assert.ok(has("taxpayer-missing", "CANONICAL_IDENTITY_MISSING"));
    assert.ok(has("supplier-person", "CANONICAL_ROLE_DUPLICATE"));
    assert.ok(has("creditor-conflict", "CREDITOR_SUPPLIER_IDENTITY_MISMATCH"));
    assert.ok(has("creditor-conflict", "CREDITOR_DOCUMENT_MISMATCH"));
    assert.equal(JSON.stringify(issues).includes("52998224725"), false);
    assert.deepEqual((await pg.query('SELECT * FROM "Creditor" WHERE id=$1', ["creditor-conflict"])).rows, before);
  } finally { await pg.close(); }
});
