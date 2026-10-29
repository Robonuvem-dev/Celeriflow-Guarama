import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { itbiDeclarations, itbiParties } from "../src/db/schema/tax-itbi";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { readItbiDeclaration, requireItbiRecord, updateItbiDeclaration } from "../src/db/repositories/tax-itbi/records";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { createItbiDrizzleFixture, seedItbiDeclaration } from "./helpers/itbi-drizzle-fixture";
import { attributeItbiHistory } from "../src/lib/tributacao/itbi-history";
import { postgresError } from "./helpers/postgres-assertion";

test("ITBI: histórico nativo preserva Decimal, autor, partes, posição legada e rollback sem reconstruir passado", async () => {
  const f = await createItbiDrizzleFixture({ fieldHistory: false });
  try {
    const declaration = await seedItbiDeclaration(f, "legacy");
    await f.database.exec(await readFile("prisma/migrations-ibema/20261015230000_itbi_field_history/migration.sql", "utf8"));
    const historyCount = async () => (await f.db.select({ n: count() }).from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "ITBI_FIELD_HISTORY")))[0].n;
    assert.equal(await historyCount(), 0);
    await withDatabaseTransaction(f.connection, async tx => {
      await attributeItbiHistory(tx, f.actor);
      await updateItbiDeclaration(tx, declaration.id, { status: "PROTOCOLADA", taxAmount: new Decimal("9999999999999999.99") });
      await tx.insert(itbiParties).values({ id: "party", declarationId: declaration.id, taxpayerId: "buyer", role: "ADQUIRENTE", participationPercent: new Decimal(100) });
    });
    const history = await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, declaration.id), eq(taxRegistryEntries.category, "ITBI_FIELD_HISTORY"))).orderBy(asc(taxRegistryEntries.version));
    assert.equal(history.length, 2); assert.equal(history[0].source, "POSICAO_LEGADA_OBSERVADA"); assert.equal(history[0].actorUsuarioId, null);
    assert.equal(history[1].actorUsuarioId, f.actor.usuarioId);
    const change = taxScopeSnapshot(history[1].data);
    assert.equal(taxScopeSnapshot(change.before).status, "RASCUNHO"); assert.equal(taxScopeSnapshot(change.before).taxAmount, "20.00"); assert.equal(taxScopeSnapshot(change.after).taxAmount, "9999999999999999.99"); assert.equal(change.actorName, "Ana Paula Martins");
    assert.deepEqual(change.fields, ["status", "taxAmount"]);
    await withDatabaseTransaction(f.connection, async tx => { await attributeItbiHistory(tx, f.actor); await tx.update(itbiParties).set({ participationPercent: new Decimal(50) }).where(eq(itbiParties.id, "party")); });
    const party = requireItbiRecord((await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "ITBI_PARTY"), eq(taxRegistryEntries.entityId, "party"), eq(taxRegistryEntries.category, "ITBI_FIELD_HISTORY"))).orderBy(desc(taxRegistryEntries.version)).limit(1))[0]);
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(party.data).before).participationPercent, "100.000000");
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(party.data).after).participationPercent, "50.000000");
    const beforeRollback = await historyCount();
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => { await attributeItbiHistory(tx, f.actor); await updateItbiDeclaration(tx, declaration.id, { status: "CANCELADA" }); throw new Error("history rollback"); }), /history rollback/);
    assert.equal(await historyCount(), beforeRollback);
    assert.equal((await readItbiDeclaration(f.db, declaration.id)).status, "PROTOCOLADA");
    await assert.rejects(async () => { await f.db.delete(taxRegistryEntries).where(eq(taxRegistryEntries.id, history[1].id)); }, postgresError("P0001", "Histórico do ITBI é imutável; registre novo evento ou cancelamento."));
    await assert.rejects(async () => { await f.db.delete(itbiDeclarations).where(eq(itbiDeclarations.id, declaration.id)); }, postgresError("P0001", "Histórico do ITBI é imutável; registre novo evento ou cancelamento."));
    await f.db.update(itbiDeclarations).set({ analysisNotes: "Escrita sem atribuição de operador" }).where(eq(itbiDeclarations.id, declaration.id));
    const unattributed = requireItbiRecord((await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, declaration.id), eq(taxRegistryEntries.category, "ITBI_FIELD_HISTORY"))).orderBy(desc(taxRegistryEntries.version)).limit(1))[0]);
    assert.equal(unattributed.actorUsuarioId, null); assert.equal(taxScopeSnapshot(unattributed.data).actorAttribution, "NAO_IDENTIFICADO");
  } finally { await f.close(); }
});
