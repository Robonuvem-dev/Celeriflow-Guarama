import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { listDemandVersions, recordDemandVersion } from "../src/db/repositories/procurement/purchase-demand";
import type { DatabaseExecutor } from "../src/db/transaction";

test("DFD preserves prior snapshots and rejects conflicting revisions", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE "PurchaseRequest" ("id" TEXT PRIMARY KEY); INSERT INTO "PurchaseRequest" VALUES (\'req\');');
    await pg.exec(await readFile("db/migrations/20261103130000_cf30_demand_versions/migration.sql", "utf8"));
    const db = drizzle(pg) as unknown as DatabaseExecutor;
    const snapshot = {
      number: "1", object: "Compra", justification: "Necessidade original",
      secretariat: "Administração", department: "Compras", requester: "Servidor",
      priority: "Normal", status: "Aprovada", createdAt: "2026-11-03T00:00:00Z",
      approvedAt: "2026-11-03T01:00:00Z", estimatedValue: 100, items: [], planning: [],
    };
    assert.equal(await recordDemandVersion(db, "req", "autor", 0, snapshot), 1);
    assert.equal(await recordDemandVersion(db, "req", "autor", 0, snapshot), 1);
    const revised = { ...snapshot, justification: "Justificativa revisada" };
    await assert.rejects(recordDemandVersion(db, "req", "revisor", 0, revised), /atualizado/);
    assert.equal(await recordDemandVersion(db, "req", "revisor", 1, revised), 2);
    const versions = await listDemandVersions(db, "req");
    assert.deepEqual(versions.map(row => [row.version, row.actorId, row.snapshot.justification]), [
      [2, "revisor", revised.justification], [1, "autor", snapshot.justification],
    ]);
    assert.deepEqual(await listDemandVersions(db, "outra"), []);
  } finally {
    await pg.close();
  }
});
