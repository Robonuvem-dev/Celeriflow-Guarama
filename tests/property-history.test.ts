import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createPropertyWithHistory, updatePropertyWithHistory, attributePropertyHistory } from "../src/lib/tributacao/property-history";

test("IPTU: todos os produtores preservam histórico, zero, concorrência e rollback", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    await f.db.realEstate.create({ data: { id: "legacy", municipalInsc: "OLD", landArea: 100, builtArea: 0 } });
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015100000_tax_property_cadastral_history/migration.sql", "utf8"));
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015110000_real_estate_cadastral_history/migration.sql", "utf8"));
    await updatePropertyWithHistory(f.db, "ana", "legacy", { builtArea: 30 });
    const initial = await f.db.taxRegistryEntry.findMany({ where: { entityId: "legacy", category: "CADASTRAL_HISTORY" }, orderBy: { version: "asc" } });
    assert.equal(initial.length, 2);
    assert.equal((initial[0].data as { after: { builtArea: number } }).after.builtArea, 0);
    assert.equal((initial[1].data as { before: { builtArea: number }; after: { builtArea: number } }).before.builtArea, 0);
    assert.equal(initial[1].actorUsuarioId, "ana");
    assert.ok(initial[0].effectiveFrom > (await f.db.realEstate.findUniqueOrThrow({ where: { id: "legacy" } })).createdAt);
    await Promise.all([updatePropertyWithHistory(f.db, "ana", "legacy", { landArea: 200 }), updatePropertyWithHistory(f.db, "ana", "legacy", { status: "Suspenso" })]);
    const positions = await f.db.taxRegistryEntry.findMany({ where: { entityId: "legacy", category: "CADASTRAL_HISTORY" }, orderBy: { version: "asc" } });
    assert.deepEqual(positions.map(position => position.version), [1, 2, 3, 4]);
    assert.deepEqual((positions[3].data as { before: unknown }).before, (positions[2].data as { after: unknown }).after);
    await updatePropertyWithHistory(f.db, "ana", "legacy", { builtArea: 30 });
    assert.equal(await f.db.taxRegistryEntry.count({ where: { entityId: "legacy", category: "CADASTRAL_HISTORY" } }), 4);
    await assert.rejects(f.db.$transaction(async tx => { await attributePropertyHistory(tx, "ana"); await tx.realEstate.update({ where: { id: "legacy" }, data: { builtArea: 99 } }); throw new Error("rollback cadastral"); }), /rollback cadastral/);
    assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: "legacy" } })).builtArea, 30);
    assert.equal(await f.db.taxRegistryEntry.count({ where: { entityId: "legacy", category: "CADASTRAL_HISTORY" } }), 4);
    await f.db.realEstate.update({ where: { id: "legacy" }, data: { builtArea: 50 } });
    const direct = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityId: "legacy", category: "CADASTRAL_HISTORY" }, orderBy: { version: "desc" } });
    assert.equal(direct.actorUsuarioId, null);
    assert.equal((direct.data as { after: { builtArea: number } }).after.builtArea, 50);
    await assert.rejects(f.db.taxRegistryEntry.delete({ where: { id: direct.id } }), /imutável/);
    await assert.rejects(f.db.realEstate.delete({ where: { id: "legacy" } }), /baixa cadastral/);
    const created = await createPropertyWithHistory(f.db, "ana", { municipalInsc: "NEW", landArea: 0, builtArea: 0 });
    assert.equal(await f.db.taxRegistryEntry.count({ where: { entityId: created.id, category: "CADASTRAL_HISTORY" } }), 1);
  } finally { await f.close(); }
});
