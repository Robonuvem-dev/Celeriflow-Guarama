import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, count, eq } from "drizzle-orm";
import { createPropertyDrizzleFixture, propertyError } from "../src/db/repositories/tax-property/test-fixture";
import { mutateProperty, readProperty } from "../src/db/repositories/tax-property/records";
import { withDatabaseTransaction } from "../src/db/transaction";
import { realEstates } from "../src/db/schema/registry";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { createPropertyWithHistory, updatePropertyWithHistory, attributePropertyHistory } from "../src/lib/tributacao/property-history";

test("IPTU: todos os produtores preservam histórico, zero, concorrência e rollback", async () => {
  const f = await createPropertyDrizzleFixture({ before: "20261015100000_tax_property_cadastral_history" });
  try {
    await f.db.insert(realEstates).values({ id: "legacy", municipalInsc: "OLD", landArea: 100, builtArea: 0 });
    await f.migrate();
    const history = () => f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, "legacy"), eq(taxRegistryEntries.category, "CADASTRAL_HISTORY"))).orderBy(asc(taxRegistryEntries.version));
    await updatePropertyWithHistory(f.connection, "ana", "legacy", { builtArea: 30 });
    const initial = await history();
    assert.equal(initial.length, 2);
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(initial[0].data).after).builtArea, 0);
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(initial[1].data).before).builtArea, 0);
    assert.equal(initial[1].actorUsuarioId, "ana");
    assert.ok(initial[0].effectiveFrom > (await readProperty(f.db, "legacy")).createdAt);
    await Promise.all([updatePropertyWithHistory(f.connection, "ana", "legacy", { landArea: 200 }), updatePropertyWithHistory(f.connection, "ana", "legacy", { status: "Suspenso" })]);
    const positions = await history();
    assert.deepEqual(positions.map(position => position.version), [1, 2, 3, 4]);
    assert.deepEqual(taxScopeSnapshot(positions[3].data).before, taxScopeSnapshot(positions[2].data).after);
    await updatePropertyWithHistory(f.connection, "ana", "legacy", { builtArea: 30 });
    assert.equal((await history()).length, 4);
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => { await attributePropertyHistory(tx, "ana"); await mutateProperty(tx, "legacy", { builtArea: 99 }); throw new Error("rollback cadastral"); }), /rollback cadastral/);
    assert.equal((await readProperty(f.db, "legacy")).builtArea, 30);
    assert.equal((await history()).length, 4);
    await f.db.update(realEstates).set({ builtArea: 50 }).where(eq(realEstates.id, "legacy"));
    const direct = (await history()).at(-1)!;
    assert.equal(direct.actorUsuarioId, null);
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(direct.data).after).builtArea, 50);
    await assert.rejects(f.db.delete(taxRegistryEntries).where(eq(taxRegistryEntries.id, direct.id)), propertyError(/imutável/));
    await assert.rejects(f.db.delete(realEstates).where(eq(realEstates.id, "legacy")), propertyError(/baixa cadastral/));
    const created = await createPropertyWithHistory(f.connection, "ana", { municipalInsc: "NEW", landArea: 0, builtArea: 0 });
    assert.equal((await f.db.select({ count: count() }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, created.id), eq(taxRegistryEntries.category, "CADASTRAL_HISTORY"))))[0].count, 1);
  } finally { await f.close(); }
});
