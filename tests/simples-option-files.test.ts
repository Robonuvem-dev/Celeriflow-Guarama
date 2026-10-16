import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { publishSimplesOptionLayout, importSimplesOptionFile, decideSimplesOptionCompany } from "../src/lib/tributacao/simples-option-files";

test("Simples TXT: bytes e layout congelados, pendências de origem explícitas, exportação e decisões versionadas", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015220000_tax_channel_document_integrity/migration.sql", "utf8"));
    await f.db.taxpayer.create({ data: { id: "simples-payer", taxpayerType: "PJ", companyId: "empresa", status: "Ativo" } });
    await f.db.economicRegistration.create({ data: { id: "simples-registration", municipalInsc: "SIMPLES-1", taxpayerId: "simples-payer", status: "Ativo" } });
    await f.db.taxRegistryEntry.create({ data: { entityType: "ECONOMIC_REGISTRATION", entityId: "simples-registration", category: "ECONOMIC_PROFILE", title: "Origem conferida", data: { governmentEntityId: "ente", budgetUnitId: "ug" } } });
    await f.db.tax.create({ data: { id: "iss", name: "ISS", taxType: "Imposto" } });
    await f.db.taxAssessment.create({ data: { taxId: "iss", taxpayerId: "simples-payer", year: 2026, originalValue: 10, originalValueDecimal: "10", finalValueDecimal: "10" } });
    const layout = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, name: "Intercâmbio municipal", active: true, format: "DELIMITED" as const, delimiter: ";" as const, cnpjColumn: 1, cnpjStart: 1, cnpjLength: 14, headerRows: 1, footerRows: 0, outputDelimiter: ";" as const, outputHeader: "CNPJ;PENDENCIAS;SALDO", approvalTitle: "Termo de deferimento", refusalTitle: "Termo de indeferimento", termText: "Decisão municipal sobre a opção informada.", legalBasis: "Norma municipal informada" };
    await publishSimplesOptionLayout(f.db, f.actor, layout);
    const bytes = Buffer.from("CNPJ;NOME\r\n11222333000181;Araucárias\r\n99999999000199;Não cadastrado\r\n", "utf8");
    const input = { governmentEntityId: "ente", budgetUnitId: "ug", expectedLayoutVersion: 1, filename: "opcoes.txt", originalBase64: bytes.toString("base64"), encoding: "utf-8" as const };
    await assert.rejects(importSimplesOptionFile(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
    const imported = await importSimplesOptionFile(f.db, f.actor, input);
    assert.equal((await importSimplesOptionFile(f.db, f.actor, input)).id, imported.id);
    const frozen = imported.data as { originalBase64: string; checksum: string; rows: { cnpj: string; balance: string; pending: string[] }[] };
    assert.equal(frozen.originalBase64, bytes.toString("base64")); assert.equal(frozen.checksum, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(frozen.rows[0].pending.includes("ORIGEM_DEBITO_NAO_CONCILIADA")); assert.ok(frozen.rows[1].pending.includes("CADASTRO_NAO_CONCILIADO"));
    const exported = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityId: imported.entityId, category: "SIMPLES_OPTION_EXPORT" } });
    assert.match((exported.data as { content: string }).content, /11222333000181;ORIGEM_DEBITO_NAO_CONCILIADA/);
    const refused = await decideSimplesOptionCompany(f.db, f.actor, { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 0, approved: false, reason: "Pendência cadastral e fiscal conferida" });
    await assert.rejects(decideSimplesOptionCompany(f.db, f.actor, { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 0, approved: true, reason: "Revisão sem versão" }), /alterada/);
    await decideSimplesOptionCompany(f.db, f.actor, { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 1, approved: true, reason: "Decisão revista mediante conferência fiscal documentada" });
    assert.equal((refused.data as { approved: boolean }).approved, false);
    await assert.rejects(f.db.taxRegistryEntry.update({ where: { id: refused.id }, data: { title: "Outro" } }), /imutável/);
    await publishSimplesOptionLayout(f.db, f.actor, { ...layout, expectedVersion: 1, termText: "Texto da nova versão" });
    assert.equal(((refused.data as { layout: { termText: string } }).layout).termText, layout.termText);
    await assert.rejects(importSimplesOptionFile(f.db, f.actor, input), /alterado/);
  } finally { await f.close(); }
});
