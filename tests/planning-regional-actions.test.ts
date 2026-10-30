import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createPlanningCatalogOperationsFixture } from "./helpers/planning-catalog-operations-fixture";
import { planningRegionalActions } from "../src/db/schema/planning-regional-actions";
import { saveRegionalActionRecord } from "../src/lib/planejamento/regional-actions";
test("ações/subações regionalizadas persistem por PPA autorizado e rejeitam outro ente", { timeout: 180000 }, async () => {
  const fixture = await createPlanningCatalogOperationsFixture();
  fixture.connection.pool.options.max = 1;
  try {
    await fixture.database.exec(await readFile("db/migrations/20261030125000_planning_regional_actions/migration.sql", "utf8"));
    await fixture.chain("regional");
    await fixture.chain("denied-regional", { entityId: "co-other" });
    const input = { actionId: "regional:action", region: "Centro", subactionCode: "s-1", name: "Atendimento regional", active: true };
    await saveRegionalActionRecord(fixture.context, input);
    const [row] = await fixture.db.select().from(planningRegionalActions);
    assert.equal(row.region, "CENTRO"); assert.equal(row.subactionCode, "S-1");
    await assert.rejects(saveRegionalActionRecord(fixture.context, input));
    await assert.rejects(saveRegionalActionRecord(fixture.context, { ...input, actionId: "denied-regional:action" }), /fora do planejamento autorizado/);
    await saveRegionalActionRecord(fixture.context, { ...input, id: row.id, active: false });
    assert.equal((await fixture.db.select().from(planningRegionalActions).where(eq(planningRegionalActions.id, row.id)))[0].active, false);
    await saveRegionalActionRecord(fixture.context, { ...input, subactionCode: "", name: "Ação regionalizada" });
    assert.equal((await fixture.db.select().from(planningRegionalActions)).length, 2);
  } finally { await fixture.close(); }
});
