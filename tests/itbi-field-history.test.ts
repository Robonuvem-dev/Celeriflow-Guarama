import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { attributeItbiHistory } from "../src/lib/tributacao/itbi-history";

test("ITBI: histórico nativo preserva Decimal, autor, partes, posição legada e rollback sem reconstruir passado", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    // The generic fixture uses scale 6 for every Decimal; match this native money column's deployed schema.
    await f.pg.exec('ALTER TABLE "ItbiDeclaration" ALTER COLUMN "taxAmount" TYPE NUMERIC(18,2);');
    await f.db.itbiTransactionType.create({ data: { id: "type", code: "VENDA", name: "Compra e venda", rate: "2" } });
    await f.db.realEstate.create({ data: { id: "property", municipalInsc: "HISTORY-1" } });
    const declaration = await f.db.itbiDeclaration.create({ data: { id: "legacy", declarationNumber: "ITBI-HISTORY", transactionTypeId: "type", realEstateId: "property", transmittedFraction: "100", declaredPropertyValue: "1000", taxableBase: "1000", appliedRate: "2", taxAmount: "20", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" }, createdByUsuarioId: "ana" } });
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015230000_itbi_field_history/migration.sql", "utf8"));
    assert.equal(await f.db.taxRegistryEntry.count({ where: { category: "ITBI_FIELD_HISTORY" } }), 0);
    await f.db.$transaction(async tx => {
      await attributeItbiHistory(tx, f.actor);
      await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { status: "PROTOCOLADA", taxAmount: "9999999999999999.99" } });
      await tx.itbiParty.create({ data: { id: "party", declarationId: declaration.id, taxpayerId: "party-taxpayer", role: "ADQUIRENTE", participationPercent: "100" } });
    });
    const history = await f.db.taxRegistryEntry.findMany({ where: { entityId: declaration.id, category: "ITBI_FIELD_HISTORY" }, orderBy: { version: "asc" } });
    assert.equal(history.length, 2); assert.equal(history[0].source, "POSICAO_LEGADA_OBSERVADA"); assert.equal(history[0].actorUsuarioId, null);
    assert.equal(history[1].actorUsuarioId, f.actor.usuarioId);
    const change = history[1].data as { before: { status: string; taxAmount: string }; after: { status: string; taxAmount: string }; fields: string[]; actorName: string };
    assert.equal(change.before.status, "RASCUNHO"); assert.equal(change.before.taxAmount, "20.00"); assert.equal(change.after.taxAmount, "9999999999999999.99"); assert.equal(change.actorName, "Ana Paula Martins");
    assert.deepEqual(change.fields, ["status", "taxAmount"]);
    await f.db.$transaction(async tx => { await attributeItbiHistory(tx, f.actor); await tx.itbiParty.update({ where: { id: "party" }, data: { participationPercent: "50" } }); });
    const party = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "ITBI_PARTY", entityId: "party", category: "ITBI_FIELD_HISTORY" }, orderBy: { version: "desc" } });
    assert.equal((party.data as { before: { participationPercent: string }; after: { participationPercent: string } }).before.participationPercent, "100.000000");
    assert.equal((party.data as { after: { participationPercent: string } }).after.participationPercent, "50.000000");
    const count = await f.db.taxRegistryEntry.count({ where: { category: "ITBI_FIELD_HISTORY" } });
    await assert.rejects(f.db.$transaction(async tx => { await attributeItbiHistory(tx, f.actor); await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { status: "CANCELADA" } }); throw new Error("history rollback"); }), /history rollback/);
    assert.equal(await f.db.taxRegistryEntry.count({ where: { category: "ITBI_FIELD_HISTORY" } }), count);
    assert.equal((await f.db.itbiDeclaration.findUniqueOrThrow({ where: { id: declaration.id } })).status, "PROTOCOLADA");
    await assert.rejects(f.db.taxRegistryEntry.delete({ where: { id: history[1].id } }), /imutável/);
    await assert.rejects(f.db.itbiDeclaration.delete({ where: { id: declaration.id } }), /imutável/);
    await f.db.itbiDeclaration.update({ where: { id: declaration.id }, data: { analysisNotes: "Escrita sem atribuição de operador" } });
    const unattributed = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityId: declaration.id, category: "ITBI_FIELD_HISTORY" }, orderBy: { version: "desc" } });
    assert.equal(unattributed.actorUsuarioId, null); assert.equal((unattributed.data as { actorAttribution: string }).actorAttribution, "NAO_IDENTIFICADO");
  } finally { await f.close(); }
});
