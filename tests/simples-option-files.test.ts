import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { taxpayers } from "../src/db/schema/registry";
import { economicRegistrations, taxes, taxAssessments } from "../src/db/schema/taxation-core";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { createHash } from "node:crypto";
import { createTaxResidualFixture } from "./helpers/tax-residual-drizzle-fixture";
import { financeDatabaseError } from "./helpers/finance-database-error";
import { publishSimplesOptionLayout, importSimplesOptionFile, decideSimplesOptionCompany } from "../src/lib/tributacao/simples-option-files";

test("Simples TXT: bytes e layout congelados, pendências de origem explícitas, exportação e decisões versionadas", async () => {
  const f = await createTaxResidualFixture();
  try {
    await f.db.insert(taxpayers).values({ id: "simples-payer", taxpayerType: "PJ", companyId: "empresa", status: "Ativo" });
    await f.db.insert(economicRegistrations).values({ id: "simples-registration", municipalInsc: "SIMPLES-1", taxpayerId: "simples-payer", status: "Ativo" });
    await f.db.insert(taxRegistryEntries).values({ entityType: "ECONOMIC_REGISTRATION", entityId: "simples-registration", category: "ECONOMIC_PROFILE", title: "Origem conferida", data: { governmentEntityId: "ente", budgetUnitId: "ug" } });
    await f.db.insert(taxes).values({ id: "iss", name: "ISS", taxType: "Imposto" });
    await f.db.insert(taxAssessments).values({ taxId: "iss", taxpayerId: "simples-payer", year: 2026, originalValue: 10, originalValueDecimal: new Decimal("10"), finalValueDecimal: new Decimal("10") });
    const layout = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, name: "Intercâmbio municipal", active: true, format: "DELIMITED" as const, delimiter: ";" as const, cnpjColumn: 1, cnpjStart: 1, cnpjLength: 14, headerRows: 1, footerRows: 0, outputDelimiter: ";" as const, outputHeader: "CNPJ;PENDENCIAS;SALDO", approvalTitle: "Termo de deferimento", refusalTitle: "Termo de indeferimento", termText: "Decisão municipal sobre a opção informada.", legalBasis: "Norma municipal informada" };
    await publishSimplesOptionLayout(f.connection, f.actor, layout);
    const bytes = Buffer.from("CNPJ;NOME\r\n11222333000181;Araucárias\r\n99999999000199;Não cadastrado\r\n", "utf8");
    const input = { governmentEntityId: "ente", budgetUnitId: "ug", expectedLayoutVersion: 1, filename: "opcoes.txt", originalBase64: bytes.toString("base64"), encoding: "utf-8" as const };
    await assert.rejects(importSimplesOptionFile(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
    const imported = await importSimplesOptionFile(f.connection, f.actor, input);
    assert.equal((await importSimplesOptionFile(f.connection, f.actor, input)).id, imported.id);
    const frozen = imported.data as { originalBase64: string; checksum: string; rows: { cnpj: string; balance: string; pending: string[] }[] };
    assert.equal(frozen.originalBase64, bytes.toString("base64")); assert.equal(frozen.checksum, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(frozen.rows[0].pending.includes("ORIGEM_DEBITO_NAO_CONCILIADA")); assert.ok(frozen.rows[1].pending.includes("CADASTRO_NAO_CONCILIADO"));
    const [exported] = await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, imported.entityId), eq(taxRegistryEntries.category, "SIMPLES_OPTION_EXPORT")));
    assert.match((exported.data as { content: string }).content, /11222333000181;ORIGEM_DEBITO_NAO_CONCILIADA/);
    const refused = await decideSimplesOptionCompany(f.connection, f.actor, { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 0, approved: false, reason: "Pendência cadastral e fiscal conferida" });
    await assert.rejects(decideSimplesOptionCompany(f.connection, f.actor, { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 0, approved: true, reason: "Revisão sem versão" }), /alterada/);
    await decideSimplesOptionCompany(f.connection, f.actor, { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 1, approved: true, reason: "Decisão revista mediante conferência fiscal documentada" });
    assert.equal((refused.data as { approved: boolean }).approved, false);
    await assert.rejects(f.db.update(taxRegistryEntries).set({ title: "Outro" }).where(eq(taxRegistryEntries.id, refused.id)), financeDatabaseError(/imutável/));
    await publishSimplesOptionLayout(f.connection, f.actor, { ...layout, expectedVersion: 1, termText: "Texto da nova versão" });
    assert.equal(((refused.data as { layout: { termText: string } }).layout).termText, layout.termText);
    await assert.rejects(importSimplesOptionFile(f.connection, f.actor, input), /alterado/);
  } finally { await f.close(); }
});
