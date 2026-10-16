import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { readPropertyStructure } from "../src/lib/tributacao/property-structure";

test("IPTU: total edificado usa vínculos vigentes da mesma origem, sem somar área do terreno ou vínculos antigos", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    const profile = async (id: string, data: object, version = 1) => f.db.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: id, category: "PROPERTY_PROFILE", title: "Vínculo imobiliário conferido", version, data: { governmentEntityId: "ente", budgetUnitId: "ug", ...data } } });
    for (const [id, area] of [["land", 999], ["other-land", 0], ["unit-a", 25.25], ["unit-b", 30.5], ["inactive", 100], ["moved", 100], ["foreign", 100]] as const) await f.db.realEstate.create({ data: { id, municipalInsc: id, builtArea: area, status: id === "inactive" ? "Baixado" : "Ativo" } });
    await profile("land", { kind: "Terreno", parentId: null }); await profile("other-land", { kind: "Terreno", parentId: null });
    for (const id of ["unit-a", "unit-b", "inactive", "moved"]) await profile(id, { kind: "Unidade", parentId: "land", unitMode: id === "unit-a" ? "ENGLOBADA" : "AUTONOMA" });
    await profile("moved", { kind: "Unidade", parentId: "other-land" }, 2);
    await profile("foreign", { kind: "Unidade", parentId: "land", governmentEntityId: "outro-ente", budgetUnitId: "outra-ug" });
    const total = await readPropertyStructure(f.db, f.actor, "land");
    assert.ok(total); assert.equal(total.totalUnitBuiltArea, "55.750000"); assert.equal(total.units.length, 2);
    assert.equal((await readPropertyStructure(f.db, f.actor, "unit-a"))?.land.id, "land");
    assert.equal((await readPropertyStructure(f.db, f.actor, "unit-a"))?.units.find(row => row.id === "unit-a")?.mode, "Englobada");
    await assert.rejects(readPropertyStructure(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, "land"), /origem autorizada/);
    await f.db.realEstate.update({ where: { id: "unit-b" }, data: { builtArea: null } });
    assert.equal((await readPropertyStructure(f.db, f.actor, "land"))?.totalUnitBuiltArea, null);
    await f.db.realEstate.create({ data: { id: "legacy", builtArea: 10 } });
    assert.equal(await readPropertyStructure(f.db, { ...f.actor, allowedBudgetUnitIds: undefined }, "legacy"), null);
  } finally { await f.close(); }
});
