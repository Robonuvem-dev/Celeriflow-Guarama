import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray } from "drizzle-orm";
import { createPropertyDrizzleFixture } from "../src/db/repositories/tax-property/test-fixture";
import { readProperty } from "../src/db/repositories/tax-property/records";
import { documents, realEstates, taxpayers } from "../src/db/schema/registry";
import { taxes, taxAssessments } from "../src/db/schema/taxation-core";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { Decimal } from "../src/db/decimal";
import { copyProperties, reorganizeProperties, bulkChangeProperties } from "../src/lib/tributacao/property-operations";

test("IPTU: cópia e reorganização atômicas conservam áreas, inscrições e documentos de origem", async () => {
  const f = await createPropertyDrizzleFixture();
  try {
    const [source] = await f.db.insert(realEstates).values({ id: "source", municipalInsc: "SOURCE", landArea: 100, builtArea: 20, streetName: "Rua" }).returning();
    await f.db.insert(taxes).values({ id: "iptu", name: "IPTU", taxType: "Imposto" });
    await f.db.insert(taxpayers).values({ id: "owner", taxpayerType: "PF" });
    await f.db.insert(taxAssessments).values({ id: "source-debt", year: 2026, realEstateId: source.id, taxpayerId: "owner", taxId: "iptu", originalValue: 10, originalValueDecimal: new Decimal("10"), finalValueDecimal: new Decimal("10") });
    const [document] = await f.db.insert(documents).values({ title: "Matrícula de origem", documentType: "MATRICULA", fileUrl: "/ged/origem", status: "Válido" }).returning();
    await f.db.insert(taxRegistryEntries).values({ entityType: "REAL_ESTATE", entityId: source.id, category: "DOCUMENTO", title: document.title, documentId: document.id, data: { details: "Documento de origem" } });
    await f.db.insert(taxRegistryEntries).values({ entityType: "REAL_ESTATE", entityId: source.id, category: "BCI", title: "Pavimentação", data: { value: "Asfalto" } });
    const scope = { governmentEntityId: "ente", budgetUnitId: "ug", processId: null, reason: "Reorganização documentada" };
    const target = { id: source.id, updatedAt: source.updatedAt.toISOString() };
    const copy = await copyProperties(f.connection, f.actor, { ...scope, source: target, inscriptions: ["COPY-1", "COPY-2"] });
    assert.equal(copy.length, 2);
    assert.equal((await f.db.select({ count: count() }).from(taxRegistryEntries).where(and(inArray(taxRegistryEntries.entityId, copy.map(item => item.id)), eq(taxRegistryEntries.category, "BCI"))))[0].count, 2);
    assert.equal((await f.db.select({ count: count() }).from(taxAssessments).where(inArray(taxAssessments.realEstateId, copy.map(item => item.id))))[0].count, 0);
    assert.equal((await readProperty(f.db, copy[0].id)).landArea, 100);
    await assert.rejects(copyProperties(f.connection, f.actor, { ...scope, source: target, inscriptions: ["ROLLBACK-COPY", "COPY-1"] }));
    assert.equal((await f.db.select({ count: count() }).from(realEstates).where(eq(realEstates.municipalInsc, "ROLLBACK-COPY")))[0].count, 0);
    const split = { ...scope, operation: "SPLIT" as const, sources: [target], destinations: [{ inscription: "SPLIT-1", landArea: "60", builtArea: "10", propertyType: "Terreno" as const, taxpayerId: null }, { inscription: "SPLIT-2", landArea: "40", builtArea: "10", propertyType: "Terreno" as const, taxpayerId: null }] };
    await assert.rejects(reorganizeProperties(f.connection, f.actor, { ...split, destinations: split.destinations.map(item => ({ ...item, landArea: "1" })) }), /conservar/);
    assert.equal((await readProperty(f.db, source.id)).status, "Regular");
    const divided = await reorganizeProperties(f.connection, f.actor, split);
    assert.equal(divided.created.length, 2);
    assert.equal((await readProperty(f.db, source.id)).status, "Desmembrado");
    await assert.rejects(reorganizeProperties(f.connection, f.actor, split), /alterado/);
    const pieces = await f.db.select().from(realEstates).where(inArray(realEstates.id, divided.created.map(item => item.id)));
    const merged = await reorganizeProperties(f.connection, f.actor, { ...scope, operation: "MERGE", sources: pieces.map(piece => ({ id: piece.id, updatedAt: piece.updatedAt.toISOString() })), destinations: [{ inscription: "MERGED", landArea: "100", builtArea: "20", propertyType: "Terreno", taxpayerId: null }] });
    assert.equal((await readProperty(f.db, merged.created[0].id)).landArea, 100);
    assert.equal((await f.db.select({ count: count() }).from(realEstates).where(and(inArray(realEstates.id, pieces.map(piece => piece.id)), eq(realEstates.status, "Remembrado"))))[0].count, 2);
    assert.equal((await f.db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, merged.certificateId))).length, 1);
    assert.equal((await f.db.select({ count: count() }).from(realEstates).where(eq(realEstates.id, source.id)))[0].count, 1);
    assert.equal((await f.db.select().from(taxAssessments).where(eq(taxAssessments.id, "source-debt")))[0].realEstateId, source.id);
    assert.equal((await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, source.id), eq(taxRegistryEntries.category, "DOCUMENTO"), eq(taxRegistryEntries.documentId, document.id)))).length, 1);
  } finally { await f.close(); }
});

test("IPTU: alteração geral reconfere seleção e versões antes de gravar", async () => {
  const f = await createPropertyDrizzleFixture();
  try {
    for (const id of ["A", "B"]) await f.db.insert(realEstates).values({ id, municipalInsc: id, streetName: "Rua alvo" });
    const rows = await f.db.select().from(realEstates);
    const input = { governmentEntityId: "ente", budgetUnitId: "ug", reason: "Alteração geral conferida", processId: null, filter: { query: "Rua alvo" }, targets: rows.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString() })), changes: { status: "Suspenso" } };
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, { ...input, targets: [input.targets[0]] }), /seleção/);
    assert.equal((await f.db.select({ count: count() }).from(realEstates).where(eq(realEstates.status, "Suspenso")))[0].count, 0);
    await assert.rejects(bulkChangeProperties(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
    assert.equal((await bulkChangeProperties(f.connection, f.actor, input)).count, 2);
    assert.equal((await f.db.select({ count: count() }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "CADASTRAL_OPERATION"), eq(taxRegistryEntries.title, "BULK_PROPERTY_CHANGE"))))[0].count, 2);
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, input), /alterado/);
  } finally { await f.close(); }
});
