import assert from "node:assert/strict";
import test from "node:test";
import { people } from "../src/db/schema/people";
import { addresses, companies, taxpayers } from "../src/db/schema/registry";
import { readFiscalPeoplePage } from "../src/db/repositories/taxation-pages/cadastral-details";
import { createSpecializedDrizzleFixture } from "./helpers/specialized-drizzle-fixture";

test("busca fiscal nominal não inclui CPFs não relacionados e mantém documentos, endereço e paginação", async () => {
  const fixture = await createSpecializedDrizzleFixture();
  const db = fixture.connection.db;
  try {
    await db.insert(people).values([
      { id: "person:target", fullName: "Thiago Morcatty", cpf: "99377290171" },
      ...Array.from({ length: 21 }, (_, index) => ({ id: `person:other:${index}`, fullName: `Outra Pessoa ${index}`, cpf: String(80000000000 + index) })),
    ]);
    await db.insert(companies).values({ id: "company:target", corporateName: "Oficina Estrela", cnpj: "AB123456000190" });
    await db.insert(taxpayers).values([
      { id: "taxpayer:target", taxpayerType: "PF", personId: "person:target", municipalInsc: "PF-ALVO" },
      ...Array.from({ length: 21 }, (_, index) => ({ id: `taxpayer:other:${index}`, taxpayerType: "PF", personId: `person:other:${index}` })),
      { id: "taxpayer:company", taxpayerType: "PJ", companyId: "company:target" },
    ]);
    await db.insert(addresses).values({ id: "address:target", personId: "person:target", streetName: "Rua das Acácias" });
    for (const query of ["Morcatty", "PF-ALVO", "993.772.901-71"]) {
      const result = await readFiscalPeoplePage(db, query, 1);
      assert.equal(result.total, 1, query);
      assert.deepEqual(result.taxpayers.map(row => row.id), ["taxpayer:target"], query);
      assert.equal(result.taxpayers[0].person?.addresses[0]?.streetName, "Rua das Acácias");
    }
    for (const query of ["Estrela", "AB.123.456/0001-90"]) {
      const result = await readFiscalPeoplePage(db, query, 1);
      assert.equal(result.total, 1, query);
      assert.equal(result.taxpayers[0].id, "taxpayer:company");
    }
    assert.equal((await readFiscalPeoplePage(db, "NomeInexistente", 1)).total, 0);
    const first = await readFiscalPeoplePage(db, "Outra Pessoa", 1);
    const second = await readFiscalPeoplePage(db, "Outra Pessoa", 2);
    assert.equal(first.total, 21);
    assert.equal(first.taxpayers.length, 20);
    assert.equal(second.taxpayers.length, 1);
    assert.ok(!first.taxpayers.some(row => row.id === second.taxpayers[0].id));
  } finally { await fixture.close(); }
});
