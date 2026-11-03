import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { advanceDemandWorkflow, listDemandEvents } from "../src/db/repositories/procurement/purchase-demand-workflow";
import type { DatabaseExecutor } from "../src/db/transaction";

test("DFD tramita com versão fixa do GED, autoria separada e proteção contra decisão antiga", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE "PurchaseDemandVersion" (id TEXT PRIMARY KEY);
      CREATE TABLE "DocumentVersion" (id TEXT PRIMARY KEY);
      INSERT INTO "PurchaseDemandVersion" VALUES ('dfd'), ('other');
      INSERT INTO "DocumentVersion" VALUES ('ged-v1');
    `);
    await pg.exec(await readFile("db/migrations/20261103140000_cf30_demand_workflow/migration.sql", "utf8"));
    const db = drizzle(pg) as unknown as DatabaseExecutor;
    await assert.rejects(advanceDemandWorkflow(db, "dfd", "reviewer", 0, "APROVADO", "Análise", null), /inválida/);
    await assert.rejects(advanceDemandWorkflow(db, "dfd", "author", 0, "EM_ANALISE", "Envio", null), /GED/);
    await advanceDemandWorkflow(db, "dfd", "author", 0, "EM_ANALISE", "Envio", "ged-v1");
    await assert.rejects(advanceDemandWorkflow(db, "dfd", "author", 1, "APROVADO", "Análise", null), /outro usuário/);
    await assert.rejects(advanceDemandWorkflow(db, "dfd", "reviewer", 0, "APROVADO", "Análise", null), /atualizada/);
    await advanceDemandWorkflow(db, "dfd", "reviewer", 1, "DEVOLVIDO", "Revisar objeto", null);
    await assert.rejects(advanceDemandWorkflow(db, "dfd", "reviewer", 2, "APROVADO", "Análise", null), /inválida/);
    assert.deepEqual((await listDemandEvents(db, "dfd")).map(row => [row.status, row.actorId, row.documentVersionId]), [
      ["DEVOLVIDO", "reviewer", "ged-v1"], ["EM_ANALISE", "author", "ged-v1"],
    ]);
    assert.deepEqual(await listDemandEvents(db, "other"), []);
  } finally {
    await pg.close();
  }
});
