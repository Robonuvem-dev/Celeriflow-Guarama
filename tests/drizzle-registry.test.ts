import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { companies, realEstates, suppliers, taxpayers } from "../src/db/schema/registry";
import { users } from "../src/db/schema/identity";
import * as registry from "../src/db/repositories/registry/operations";
import { syntheticCnpj, syntheticCpf } from "../src/lib/poc/fixture-catalog";
import { requireValidCnpj, requireValidCpf } from "../src/lib/identifiers/brazilian-identifiers";
import { getSupplierList, getSupplierReportRows, parseSupplierFilters } from "../src/app/app-domain/cadastros/fornecedores/supplier-query";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

test("Cadastros: identidade PF/PJ, endereço, contribuinte, fornecedores e histórico imobiliário", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 120_000,
}, async t => {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const connection = createDatabaseConnection(url);
  // Keep the search fixture alphabetic: legacy supplier search also extracts
  // digits and ORs them against canonical documents.
  const fixture = `drizzleregistry${createId().replace(/\d/g, "")}`;
  const rollback = new Error("expected registry rollback");
  let personId = "", propertyId = "";
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      let cpf = "";
      for (let seed = 8_100_000; seed < 8_100_100; seed++) {
        const candidate = requireValidCpf(syntheticCpf(seed));
        if (!(await tx.select({ id: people.id }).from(people).where(eq(people.cpf, candidate)).limit(1)).length) { cpf = candidate; break; }
      }
      assert.ok(cpf);
      const person = await registry.insertPersonWithAddress(tx, { fullName: fixture, cpf, gender: "Outro", raceColor: "Não informada", motherName: fixture, email: null, phonePrimary: null, birthDate: new Date("1990-01-01T12:00:00Z"), status: "Ativo" }, { zipCode: "80000000", streetName: "Rua de verificação", number: "1", complement: null });
      personId = person.id;
      await t.test("cadastro com endereço é atômico e alterações vazias preservam updatedAt", async () => {
        assert.deepEqual(await registry.updatePerson(tx, person.id, {}), person);
        const address = await tx.execute<{ personId: string; addressType: string }>(sql`SELECT "personId", "addressType" FROM "Address" WHERE "personId"=${person.id}`);
        assert.equal(address.rows.length, 1);
        assert.equal(address.rows[0].addressType, "Residencial");
        await assert.rejects(tx.transaction(nested => registry.insertPersonWithAddress(nested, { ...person, fullName: `${fixture}-duplicate` }, { zipCode: "80000000", streetName: "Rua de verificação", number: "2", complement: null })), error => getPostgresError(error)?.code === "23505");
      });
      await t.test("contribuinte PF reutiliza identidade e upsert mantém ID", async () => {
        await registry.validatePersonTaxpayer(tx, person.id);
        await registry.setPersonTaxpayer(tx, person.id, true, `${fixture}-pf`);
        const [initial] = await tx.select().from(taxpayers).where(eq(taxpayers.personId, person.id));
        await registry.setPersonTaxpayer(tx, person.id, true, `${fixture}-pf-updated`);
        const [updated] = await tx.select().from(taxpayers).where(eq(taxpayers.personId, person.id));
        assert.equal(updated.id, initial.id);
        assert.equal(updated.taxpayerType, "PF");
        assert.equal(updated.municipalInsc, `${fixture}-pf-updated`);
        await registry.setPersonTaxpayer(tx, person.id, false, null);
        assert.deepEqual(await tx.select({ id: taxpayers.id }).from(taxpayers).where(eq(taxpayers.personId, person.id)), []);
      });
      const reference = new Date("2099-01-01T12:00:00Z");
      const dates = [null, "2098-12-31T23:59:59.999Z", "2099-01-01T00:00:00.000Z", "2099-01-31T23:59:59.999Z", "2099-02-01T00:00:00.000Z"];
      const fixtureSuppliers: { id: string; companyId: string }[] = [];
      let cnpjSeed = 8_200_000;
      for (let index = 0; index < dates.length; index++) {
        let cnpj = "";
        for (; cnpjSeed < 8_200_100; cnpjSeed++) {
          const candidate = requireValidCnpj(syntheticCnpj(cnpjSeed));
          if (!(await tx.select({ id: companies.id }).from(companies).where(eq(companies.cnpj, candidate)).limit(1)).length) { cnpj = candidate; cnpjSeed++; break; }
        }
        assert.ok(cnpj);
        const company = await registry.insertCompany(tx, { corporateName: `${fixture} ${index}`, tradeName: fixture, cnpj, emailPrimary: null, phone: null, municipalInsc: null, companyType: index % 2 ? "ME" : "EPP", status: "Ativo" });
        const supplier = await registry.insertSupplier(tx, { personId: null, companyId: company.id, category: fixture, businessBranch: null, certificationsValidUntil: dates[index] ? new Date(dates[index]!) : null, bankData: null, notes: null, status: "Ativo" });
        fixtureSuppliers.push({ id: supplier.id, companyId: company.id });
      }
      await t.test("fornecedor PJ mantém CNAE, omissão, null explícito e documentos ordenados", async () => {
        const { id, companyId } = fixtureSuppliers[0];
        await registry.setCompanyTaxpayer(tx, companyId, true, `${fixture}-pj`);
        assert.equal((await tx.select().from(taxpayers).where(eq(taxpayers.companyId, companyId)))[0].taxpayerType, "PJ");
        await registry.updateCompany(tx, companyId, { primaryCnae: "4761003", secondaryCnaes: null });
        const initial = await registry.updateSupplier(tx, id, {});
        assert.deepEqual(await registry.updateSupplier(tx, id, { category: undefined }), initial);
        await registry.updateSupplier(tx, id, { bankData: "Banco de verificação" });
        await registry.updateSupplier(tx, id, { notes: "Nota de verificação" });
        await registry.updateSupplier(tx, id, { notes: null });
        const document = await registry.insertDocument(tx, { title: "Documento sem validade", documentType: "Outros", notes: null, fileUrl: "/fixture.pdf", companyId });
        await registry.insertDocument(tx, { title: "Documento com validade", documentType: "Outros", notes: null, fileUrl: "/fixture.pdf", companyId, validUntil: reference });
        const row = (await getSupplierReportRows(tx, parseSupplierFilters({ q: fixture }), reference)).find(item => item.id === id);
        assert.equal(row?.bankData, "Banco de verificação");
        assert.equal(row?.notes, null);
        assert.equal(row?.company?.primaryCnae, "4761003");
        assert.deepEqual(row?.company?.documents.map(item => item.title), ["Documento com validade", "Documento sem validade"]);
        assert.deepEqual(await registry.updateDocument(tx, document.id, {}), document);
        assert.equal((await registry.deleteDocument(tx, document.id)).id, document.id);
        await assert.rejects(registry.deleteDocument(tx, document.id), /Registro não encontrado/);
      });
      await t.test("filtros de validade respeitam meia-noite e fim do 30º dia", async () => {
        for (const [certification, expected] of [["SEM_VALIDADE", [0]], ["VENCIDA", [1]], ["VENCE_EM_BREVE", [2, 3]], ["VIGENTE", [4]]] as const) {
          const rows = await getSupplierReportRows(tx, parseSupplierFilters({ q: fixture, certification }), reference);
          assert.deepEqual(rows.map(row => row.id).sort(), expected.map(index => fixtureSuppliers[index].id).sort());
        }
        const page = await getSupplierList(tx, parseSupplierFilters({ q: fixture, page: "999999" }), reference);
        assert.equal(page.total, 5);
        assert.equal(page.page, 1);
        assert.equal(page.pageCount, 1);
        const empty = await getSupplierList(tx, parseSupplierFilters({ q: `${fixture}-missing` }), reference);
        assert.deepEqual(empty, { suppliers: [], total: 0, page: 1, pageCount: 0 });
      });
      await t.test("histórico imobiliário registra ator/versão e continua protegido contra exclusão", async () => {
        const [actor] = await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).limit(1);
        assert.ok(actor);
        const property = await registry.insertPropertyWithHistory(tx, actor.id, { municipalInsc: fixture, propertyType: "Casa", propertyUse: "Residencial", streetName: null, number: null, complement: null, landArea: 100.5, builtArea: null, status: "Regular" });
        propertyId = property.id;
        const updated = await registry.updatePropertyWithHistory(tx, actor.id, property.id, { status: "Inativo" });
        assert.equal(updated.status, "Inativo");
        const history = await tx.execute<{ actorUsuarioId: string; version: number; status: string }>(sql`SELECT "actorUsuarioId", version, data->'after'->>'status' AS status FROM "TaxRegistryEntry" WHERE "entityType"='REAL_ESTATE' AND "entityId"=${property.id} AND category='CADASTRAL_HISTORY' ORDER BY version`);
        assert.deepEqual(history.rows.map(row => [row.actorUsuarioId, row.version, row.status]), [[actor.id, 1, "Regular"], [actor.id, 2, "Inativo"]]);
        await registry.updatePropertyWithHistory(tx, actor.id, property.id, {});
        const count = await tx.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "TaxRegistryEntry" WHERE "entityId"=${property.id} AND category='CADASTRAL_HISTORY'`);
        assert.equal(count.rows[0].count, 2);
        await assert.rejects(tx.transaction(nested => nested.delete(realEstates).where(eq(realEstates.id, property.id))), error => getPostgresError(error)?.code === "P0001");
      });
      throw rollback;
    }, { timeoutMs: 90_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: people.id }).from(people).where(eq(people.id, personId)), []);
    assert.deepEqual(await connection.db.select({ id: realEstates.id }).from(realEstates).where(eq(realEstates.id, propertyId)), []);
    assert.deepEqual(await connection.db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.category, fixture), eq(suppliers.status, "Ativo"))), []);
    const history = await connection.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "TaxRegistryEntry" WHERE "entityId"=${propertyId}`);
    assert.equal(history.rows[0].count, 0);
  } finally { await connection.pool.end(); }
});
