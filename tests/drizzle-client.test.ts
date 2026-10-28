import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

function runWithoutDatabase(source: string) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_URL_UNPOOLED;
  delete env.TEST_DATABASE_URL;
  delete env.TEST_DATABASE_URL_UNPOOLED;
  return spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--eval", source], {
    cwd: root, env, encoding: "utf8", timeout: 20_000,
  });
}

test("platform permissions can be imported and evaluated without database configuration", () => {
  const result = runWithoutDatabase(`
    const assert = require("node:assert/strict");
    const { canViewModule, canPerformModuleOperation, AccessError } = require("./src/lib/platform/tenant-context.ts");
    const user = { profileCode: "GESTAO_GERAL", modulePermissions: [], permissions: null };
    assert.equal(canViewModule(user, "CONFIGURACOES"), false);
    assert.equal(canPerformModuleOperation(user, "CONFIGURACOES", "update"), false);
    assert.equal(new AccessError("Denied", 403).status, 403);
  `);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("database configuration is required on first use and one connection is reused", () => {
  const result = runWithoutDatabase(`
    const assert = require("node:assert/strict");
    const { sql } = require("drizzle-orm");
    const { db, databaseConnection } = require("./src/db/client.ts");
    assert.equal(databaseConnection.db, db);
    assert.throws(() => db.select(), /DATABASE_URL/);
    assert.throws(() => databaseConnection.pool, /DATABASE_URL/);
    process.env.DATABASE_URL = "postgresql://verification:verification@localhost:1/verification";
    const pool = databaseConnection.pool;
    const query = db.select({ value: sql.raw("1") }).from(sql.raw("(select 1) as verification")).toSQL();
    assert.match(query.sql, /select 1/);
    assert.equal(databaseConnection.pool, pool);
    assert.equal(databaseConnection.db, db);
    assert.equal(pool.totalCount, 0, "building a query must not open a network connection");
    pool.end().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
