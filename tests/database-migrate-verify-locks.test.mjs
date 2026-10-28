import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMigrationLocks } from "../scripts/database-migrate-verify-locks.mjs";
import { migrationLock } from "../scripts/database-migrate-core.mjs";

const checksum = "a".repeat(64), name = "20260101000000_lock_probe_fixture";
const set = { historical: [{ name, provenance: { installedChecksum: checksum } }], future: [], unresolved: [], policy: { recoveryReport: "fixture" }, historySha256: checksum };

function fixture({ drift = false, hangingLockSnapshot = false, failedOpen = false, hangingRollback = false } = {}) {
  const clients = [], commands = [];
  let holder = null;
  const connect = async (_url, driver) => {
    assert.equal(driver, "neon");
    const index = clients.length;
    if (failedOpen && index === 1) throw Object.assign(new Error("private-url-and-driver-details"), { code: "ECONNREFUSED" });
    const state = { pid: 800 + index, active: false, closed: false, hasLock: false, txSamples: 0, settings: { isolation: "read committed", read_only: "off", statement_timeout: "0", lock_timeout: "0", transaction_timeout: "0", idle_timeout: "0", timezone: "America/Sao_Paulo", search_path: '"$user", public', standard_strings: "on" }, local: null };
    clients.push(state);
    return {
      async exec(sql) {
        commands.push({ index, sql });
        if (sql === "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY") {
          assert.equal(state.active, false); state.active = true; state.txSamples = 0;
          state.local = { ...state.settings, read_only: "on" };
        } else if (sql === "ROLLBACK") {
          if (hangingRollback) return new Promise(() => {});
          state.active = false; state.local = null; state.hasLock = false;
          if (holder === index) holder = null;
        } else assert.fail(`Unexpected transaction command: ${sql}`);
      },
      async query(sql, parameters) {
        commands.push({ index, sql, parameters });
        const settings = state.active ? state.local : state.settings;
        if (sql.includes("current_setting('transaction_isolation')")) {
          if (hangingLockSnapshot && state.active && state.hasLock) return new Promise(() => {});
          if (state.active) state.txSamples++;
          return { rows: [{ pid: state.pid + (drift && state.active && state.txSamples > 1 ? 10 : 0), ...settings }] };
        }
        if (sql.includes("set_config('transaction_timeout','15000',true)")) {
          assert.equal(state.active, true);
          Object.assign(state.local, { statement_timeout: "15s", lock_timeout: "250ms", transaction_timeout: "15s", idle_timeout: "15s" });
          return { rows: [{}] };
        }
        if (sql.includes("set_config('statement_timeout',$1,true)")) {
          assert.equal(state.active, true);
          assert.deepEqual(parameters, ["15000", "250"]);
          Object.assign(settings, { statement_timeout: "15s", lock_timeout: "250ms", idle_timeout: "1min", search_path: "public, pg_catalog", timezone: "UTC", standard_strings: "on" });
          return { rows: [{}] };
        }
        if (sql.includes("pg_try_advisory_xact_lock")) {
          assert.equal(state.active, true); assert.equal(settings.read_only, "on"); assert.deepEqual(parameters, migrationLock);
          const acquired = holder === null || holder === index;
          if (acquired) { holder = index; state.hasLock = true; }
          return { rows: [{ acquired }] };
        }
        if (sql.includes("to_regclass")) return { rows: [{ present: parameters[0] === "public._prisma_migrations" }] };
        if (sql.includes("current_setting('timezone')")) return { rows: [{ timezone: settings.timezone }] };
        if (sql.includes("set_config('timezone',$1,true)")) { settings.timezone = parameters[0]; return { rows: [{}] }; }
        if (sql.includes("set_config('timezone','UTC',true)")) { settings.timezone = "UTC"; return { rows: [{}] }; }
        if (sql.includes("row_to_json(m)")) return { rows: [{ document: JSON.stringify({ id: "fixture", migration_name: name, checksum, started_at: "2026-01-01T01:00:00.123456-03:00", finished_at: "2026-01-01T01:00:01.654321-03:00", rolled_back_at: null, logs: "PRIVATE_LEDGER_LOG" }) }] };
        assert.fail(`Unexpected probe query: ${sql}`);
      },
      async close() { state.closed = true; state.active = false; state.hasLock = false; if (holder === index) holder = null; },
    };
  };
  return { connect, clients, commands, held: () => holder };
}

test("probe exercises actual plan contention, rollback release and private-ledger redaction", async () => {
  const transport = fixture();
  const report = await verifyMigrationLocks("private-connection-string", { connect: transport.connect, set });
  assert.equal(report.result, "PASS", JSON.stringify(report.failure));
  assert.ok(Object.values(report.checks).every(Boolean));
  assert.deepEqual(report.plans.map(plan => plan.result), ["MIGRATION_LOCK_BUSY", "ADOPTION_BLOCKED"]);
  assert.deepEqual(report.sessions.map(session => session.rollbacks), [2, 2]);
  assert.equal(report.cleanupComplete, true);
  assert.equal(transport.held(), null);
  assert.ok(transport.clients.every(client => client.closed && !client.active));
  assert.ok(transport.commands.every(({ sql }) => /^(?:SELECT|ROLLBACK$|BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY$)/.test(sql)));
  assert.equal(JSON.stringify(report).includes("PRIVATE_LEDGER_LOG"), false);
  assert.equal(JSON.stringify(report).includes("private-connection-string"), false);
});

test("backend drift fails and cleans up the transaction and both transports", async () => {
  const transport = fixture({ drift: true });
  const report = await verifyMigrationLocks("private", { connect: transport.connect, set });
  assert.equal(report.result, "FAIL");
  assert.equal(report.failure.code, "BACKEND_CHANGED_INSIDE_TRANSACTION");
  assert.equal(report.cleanupComplete, true);
  assert.equal(transport.held(), null);
  assert.ok(transport.clients.every(client => client.closed && !client.active));
});

test("one failed open cannot orphan its sibling or disclose the driver's error text", async () => {
  const transport = fixture({ failedOpen: true });
  const report = await verifyMigrationLocks("private", { connect: transport.connect, set });
  assert.equal(report.result, "FAIL");
  assert.equal(report.failure.code, "ECONNREFUSED");
  assert.ok(transport.clients.every(client => client.closed));
  assert.equal(JSON.stringify(report).includes("private-url-and-driver-details"), false);
});

test("a stalled query hits the deadline and still rolls back/releases/closes", async () => {
  const transport = fixture({ hangingLockSnapshot: true });
  const started = Date.now();
  const report = await verifyMigrationLocks("private", { connect: transport.connect, set, timeoutMs: 200 });
  assert.equal(report.result, "FAIL");
  assert.equal(report.failure.code, "PROBE_TIMEOUT");
  assert.equal(report.cleanupComplete, true);
  assert.equal(transport.held(), null);
  assert.ok(transport.clients.every(client => client.closed && !client.active));
  assert.ok(Date.now() - started < 2_000, "bounded test must not leave live timers/connections");
});

test("unacknowledged rollback still attempts transport close within the cleanup bound", async () => {
  const transport = fixture({ drift: true, hangingRollback: true });
  const report = await verifyMigrationLocks("private", { connect: transport.connect, set, timeoutMs: 200 });
  assert.equal(report.result, "FAIL");
  assert.equal(report.failure.code, "BACKEND_CHANGED_INSIDE_TRANSACTION");
  assert.equal(report.cleanupComplete, false, "no claim of acknowledged rollback on a hung transport");
  assert.equal(report.cleanup[0].rollback, "unacknowledged");
  assert.equal(report.cleanup[0].closed, true);
  assert.ok(transport.clients.every(client => client.closed));
  assert.equal(transport.held(), null);
});
