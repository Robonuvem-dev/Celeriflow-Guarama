import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createPropertyDrizzleFixture } from "../src/db/repositories/tax-property/test-fixture";
import { realEstates } from "../src/db/schema/registry";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import type { JsonValue } from "../src/db/json";
import { readPropertyStructure } from "../src/lib/tributacao/property-structure";

test("IPTU: total edificado usa vínculos vigentes da mesma origem, sem somar área do terreno ou vínculos antigos", async () => {
  // Partial link records deliberately predate full-profile edit restrictions.
  const f = await createPropertyDrizzleFixture({ before: "20261015140000_property_edit_restrictions" });
  try {
    const profile = async (id: string, data: Record<string, JsonValue>, version = 1) => f.db.insert(taxRegistryEntries).values({ entityType: "REAL_ESTATE", entityId: id, category: "PROPERTY_PROFILE", title: "Vínculo imobiliário conferido", version, data: { governmentEntityId: "ente", budgetUnitId: "ug", ...data } });
    for (const [id, area] of [["land", 999], ["other-land", 0], ["unit-a", 25.25], ["unit-b", 30.5], ["inactive", 100], ["moved", 100], ["foreign", 100]] as const) await f.db.insert(realEstates).values({ id, municipalInsc: id, builtArea: area, status: id === "inactive" ? "Baixado" : "Ativo" });
    await profile("land", { kind: "Terreno", parentId: null }); await profile("other-land", { kind: "Terreno", parentId: null });
    for (const id of ["unit-a", "unit-b", "inactive", "moved"]) await profile(id, { kind: "Unidade", parentId: "land", unitMode: id === "unit-a" ? "ENGLOBADA" : "AUTONOMA" });
    await profile("moved", { kind: "Unidade", parentId: "other-land" }, 2);
    await profile("foreign", { kind: "Unidade", parentId: "land", governmentEntityId: "outro-ente", budgetUnitId: "outra-ug" });
    const total = await readPropertyStructure(f.connection, f.actor, "land");
    assert.ok(total); assert.equal(total.totalUnitBuiltArea, "55.750000"); assert.equal(total.units.length, 2);
    assert.equal((await readPropertyStructure(f.connection, f.actor, "unit-a"))?.land.id, "land");
    assert.equal((await readPropertyStructure(f.connection, f.actor, "unit-a"))?.units.find(row => row.id === "unit-a")?.mode, "Englobada");
    await assert.rejects(readPropertyStructure(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, "land"), /origem autorizada/);
    await f.db.update(realEstates).set({ builtArea: null }).where(eq(realEstates.id, "unit-b"));
    assert.equal((await readPropertyStructure(f.connection, f.actor, "land"))?.totalUnitBuiltArea, null);
    await f.db.insert(realEstates).values({ id: "legacy", builtArea: 10 });
    assert.equal(await readPropertyStructure(f.connection, { ...f.actor, allowedBudgetUnitIds: undefined }, "legacy"), null);
  } finally { await f.close(); }
});
