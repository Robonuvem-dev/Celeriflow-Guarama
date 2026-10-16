import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { readCanonicalIdentityIssues } from "../src/lib/cadastros/identity-integrity";

test("Identidades: verifica cadeias reais por registro, documentos normalizados e preserva cadastros", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.db.person.createMany({ data: [{ id: "canonical-person", fullName: "Pessoa da fixture", cpf: "52998224725" }, { id: "duplicate-document", fullName: "Outra identidade", cpf: "529.982.247-25" }] });
    await f.db.company.create({ data: { id: "canonical-company", corporateName: "Empresa da fixture", cnpj: "11222333000181" } });
    await f.db.taxpayer.createMany({ data: [{ id: "taxpayer-wrong-type", taxpayerType: "PJ", personId: "canonical-person" }, { id: "taxpayer-ambiguous", taxpayerType: "PF", personId: "duplicate-document", companyId: "canonical-company" }, { id: "taxpayer-missing", taxpayerType: "PF" }] });
    await f.db.supplier.createMany({ data: [{ id: "supplier-person", personId: "canonical-person" }, { id: "supplier-duplicate", personId: "canonical-person" }] });
    await f.db.creditor.create({ data: { id: "creditor-conflict", name: "Credor da fixture", companyId: "canonical-company", supplierId: "supplier-person", document: "52998224725" } });
    const before = await f.db.creditor.findUniqueOrThrow({ where: { id: "creditor-conflict" } });
    const issues = await f.db.$transaction(tx => readCanonicalIdentityIssues(tx));
    const has = (id: string, type: string) => issues.some(issue => issue.recordId === id && issue.issueType === type);
    assert.ok(has("canonical-person", "CANONICAL_DOCUMENT_DUPLICATE"));
    assert.ok(has("taxpayer-wrong-type", "TAXPAYER_IDENTITY_TYPE_MISMATCH"));
    assert.ok(has("taxpayer-ambiguous", "CANONICAL_IDENTITY_AMBIGUOUS"));
    assert.ok(has("taxpayer-missing", "CANONICAL_IDENTITY_MISSING"));
    assert.ok(has("supplier-person", "CANONICAL_ROLE_DUPLICATE"));
    assert.ok(has("creditor-conflict", "CREDITOR_SUPPLIER_IDENTITY_MISMATCH"));
    assert.ok(has("creditor-conflict", "CREDITOR_DOCUMENT_MISMATCH"));
    assert.equal(JSON.stringify(issues).includes("52998224725"), false);
    assert.deepEqual(await f.db.creditor.findUniqueOrThrow({ where: { id: "creditor-conflict" } }), before);
  } finally { await f.close(); }
});
