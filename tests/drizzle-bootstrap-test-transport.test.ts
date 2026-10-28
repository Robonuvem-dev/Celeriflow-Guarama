import assert from "node:assert/strict";
import test from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { openMigrationConnection } from "../scripts/database-migrate-driver.mjs";

test("bootstrap transporte: SELECT 1 no pool TS e no driver DDL real", { timeout: 18_000 }, async t => {
  // This smoke owns its process/fixture and never replays SQL. Bound a broken
  // connection as well as teardown, so transport regressions cannot hang CI.
  let stage = "fixture initialization";
  const watchdog = setTimeout(() => {
    console.error(`Bootstrap transport smoke exceeded its connection/cleanup deadline at ${stage}.`);
    process.exit(1);
  }, 17_000);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>> | undefined;
  let connection: Awaited<ReturnType<typeof openMigrationConnection>> | undefined;
  let expired = false;
  const { neonConfig: esmConfig } = await import("@neondatabase/serverless");
  const configurations = [...new Set([neonConfig, esmConfig])];
  const before = configurations.map(configuration => ({ wsProxy: configuration.wsProxy, useSecureWebSocket: configuration.useSecureWebSocket, pipelineConnect: configuration.pipelineConnect, webSocketConstructor: configuration.webSocketConstructor }));
  try {
    const operation = (async () => {
      fixture = await createLocalDrizzleDatabase();
      const url = fixture.connection.pool.options.connectionString;
      assert.ok(url);
      for (const configuration of configurations) {
        assert.equal(configuration.useSecureWebSocket, false);
        assert.equal(configuration.pipelineConnect, false);
        assert.equal(typeof configuration.wsProxy, "function");
        if (typeof configuration.wsProxy === "function") assert.equal(configuration.wsProxy("127.0.0.1", new URL(url).port), `127.0.0.1:${new URL(url).port}`);
      }
      stage = "caller pool SELECT 1";
      assert.equal((await fixture.connection.pool.query("SELECT 1 AS value")).rows[0].value, 1);
      console.info(`Bootstrap smoke: caller pool SELECT 1 passed; ${configurations.length} Neon configuration instance(s) observed by TS.`);
      stage = "DDL driver connect/SELECT 1";
      connection = await openMigrationConnection(url);
      if (expired) { await connection.close(); return; }
      assert.equal((await connection.query("SELECT 1 AS value")).rows[0].value, 1);
      console.info("Bootstrap smoke: real DDL driver SELECT 1 passed; closing its client.");
      t.diagnostic("Pool TS/CJS e driver DDL import()/ESM responderam SELECT 1 no mesmo endpoint loopback.");
    })();
    await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => { expired = true; reject(new Error(`Bootstrap transport stalled at ${stage} for 12 seconds.`)); }, 12_000);
    })]);
  } catch (error) {
    console.error(`Bootstrap transport failure at ${stage}: ${error instanceof Error ? error.message : "unknown error"}`);
    throw error;
  } finally {
    if (deadline) clearTimeout(deadline);
    stage = "DDL connection cleanup";
    try { await connection?.close(); }
    finally { try { stage = "fixture cleanup"; await fixture?.close(); } finally { clearTimeout(watchdog); } }
    configurations.forEach((configuration, index) => {
      assert.equal(configuration.wsProxy, before[index].wsProxy);
      assert.equal(configuration.useSecureWebSocket, before[index].useSecureWebSocket);
      assert.equal(configuration.pipelineConnect, before[index].pipelineConnect);
      assert.equal(configuration.webSocketConstructor, before[index].webSocketConstructor);
    });
  }
});
