import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { copyProperties, reorganizeProperties, bulkChangeProperties } from "../src/lib/tributacao/property-operations";

test("IPTU: cópia e reorganização atômicas conservam áreas, inscrições e documentos de origem", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015100000_tax_property_cadastral_history/migration.sql", "utf8"));
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015110000_real_estate_cadastral_history/migration.sql", "utf8"));
    const source = await f.db.realEstate.create({ data: { id: "source", municipalInsc: "SOURCE", landArea: 100, builtArea: 20, streetName: "Rua" } });
    await f.db.tax.create({ data: { id: "iptu", name: "IPTU", taxType: "Imposto" } });
    await f.db.taxpayer.create({ data: { id: "owner", taxpayerType: "PF" } });
    await f.db.taxAssessment.create({ data: { id: "source-debt", year: 2026, realEstateId: source.id, taxpayerId: "owner", taxId: "iptu", originalValue: 10, originalValueDecimal: "10", finalValueDecimal: "10" } });
    const document = await f.db.document.create({ data: { title: "Matrícula de origem", documentType: "MATRICULA", fileUrl: "/ged/origem" } });
    await f.db.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: source.id, category: "DOCUMENTO", title: document.title, documentId: document.id, data: { details: "Documento de origem" } } });
    await f.db.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: source.id, category: "BCI", title: "Pavimentação", data: { value: "Asfalto" } } });
    const scope = { governmentEntityId: "ente", budgetUnitId: "ug", processId: null, reason: "Reorganização documentada" };
    const target = { id: source.id, updatedAt: source.updatedAt.toISOString() };
    const copy = await copyProperties(f.db, f.actor, { ...scope, source: target, inscriptions: ["COPY-1", "COPY-2"] });
    assert.equal(copy.length, 2);
    assert.equal(await f.db.taxRegistryEntry.count({ where: { entityId: { in: copy.map(item => item.id) }, category: "BCI" } }), 2);
    assert.equal(await f.db.taxAssessment.count({ where: { realEstateId: { in: copy.map(item => item.id) } } }), 0);
    assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: copy[0].id } })).landArea, 100);
    await assert.rejects(copyProperties(f.db, f.actor, { ...scope, source: target, inscriptions: ["ROLLBACK-COPY", "COPY-1"] }));
    assert.equal(await f.db.realEstate.count({ where: { municipalInsc: "ROLLBACK-COPY" } }), 0);
    const split = { ...scope, operation: "SPLIT" as const, sources: [target], destinations: [{ inscription: "SPLIT-1", landArea: "60", builtArea: "10", propertyType: "Terreno" as const, taxpayerId: null }, { inscription: "SPLIT-2", landArea: "40", builtArea: "10", propertyType: "Terreno" as const, taxpayerId: null }] };
    await assert.rejects(reorganizeProperties(f.db, f.actor, { ...split, destinations: split.destinations.map(item => ({ ...item, landArea: "1" })) }), /conservar/);
    assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: source.id } })).status, "Regular");
    const divided = await reorganizeProperties(f.db, f.actor, split);
    assert.equal(divided.created.length, 2);
    assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: source.id } })).status, "Desmembrado");
    await assert.rejects(reorganizeProperties(f.db, f.actor, split), /alterado/);
    const pieces = await f.db.realEstate.findMany({ where: { id: { in: divided.created.map(item => item.id) } } });
    const merged = await reorganizeProperties(f.db, f.actor, { ...scope, operation: "MERGE", sources: pieces.map(piece => ({ id: piece.id, updatedAt: piece.updatedAt.toISOString() })), destinations: [{ inscription: "MERGED", landArea: "100", builtArea: "20", propertyType: "Terreno", taxpayerId: null }] });
    assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: merged.created[0].id } })).landArea, 100);
    assert.equal(await f.db.realEstate.count({ where: { id: { in: pieces.map(piece => piece.id) }, status: "Remembrado" } }), 2);
    assert.ok(await f.db.taxRegistryEntry.findUnique({ where: { id: merged.certificateId } }));
    assert.equal(await f.db.realEstate.count({ where: { id: source.id } }), 1);
    assert.equal((await f.db.taxAssessment.findUniqueOrThrow({ where: { id: "source-debt" } })).realEstateId, source.id);
    assert.ok(await f.db.taxRegistryEntry.findFirst({ where: { entityId: source.id, category: "DOCUMENTO", documentId: document.id } }));
  } finally { await f.close(); }
});

test("IPTU: alteração geral reconfere seleção e versões antes de gravar", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015100000_tax_property_cadastral_history/migration.sql", "utf8"));
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015110000_real_estate_cadastral_history/migration.sql", "utf8"));
    for (const id of ["A", "B"]) await f.db.realEstate.create({ data: { id, municipalInsc: id, streetName: "Rua alvo" } });
    const rows = await f.db.realEstate.findMany();
    const input = { governmentEntityId: "ente", budgetUnitId: "ug", reason: "Alteração geral conferida", processId: null, filter: { query: "Rua alvo" }, targets: rows.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString() })), changes: { status: "Suspenso" } };
    await assert.rejects(bulkChangeProperties(f.db, f.actor, { ...input, targets: [input.targets[0]] }), /seleção/);
    assert.equal(await f.db.realEstate.count({ where: { status: "Suspenso" } }), 0);
    await assert.rejects(bulkChangeProperties(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
    assert.equal((await bulkChangeProperties(f.db, f.actor, input)).count, 2);
    assert.equal(await f.db.taxRegistryEntry.count({ where: { category: "CADASTRAL_OPERATION", title: "BULK_PROPERTY_CHANGE" } }), 2);
    await assert.rejects(bulkChangeProperties(f.db, f.actor, input), /alterado/);
  } finally { await f.close(); }
});
