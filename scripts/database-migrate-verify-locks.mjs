import { isDeepStrictEqual } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import { migrationLock, MigrationBlockedError, runDatabaseMigrations } from "./database-migrate-core.mjs";
import { openMigrationConnection } from "./database-migrate-driver.mjs";
import { loadMigrationSet, repositoryRoot } from "./database-migrate-files.mjs";
import { scanSql } from "./database-migrate-sql.mjs";

const begin = "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY";
const tryLock = "SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS acquired";
const snapshotSql = `SELECT pg_backend_pid() AS pid,
  current_setting('transaction_isolation') AS isolation,
  current_setting('transaction_read_only') AS read_only,
  current_setting('statement_timeout') AS statement_timeout,
  current_setting('lock_timeout') AS lock_timeout,
  current_setting('transaction_timeout') AS transaction_timeout,
  current_setting('idle_in_transaction_session_timeout') AS idle_timeout,
  current_setting('timezone') AS timezone,
  current_setting('search_path') AS search_path,
  current_setting('standard_conforming_strings') AS standard_strings`;
const localBounds = "SELECT set_config('statement_timeout','15000',true),set_config('lock_timeout','250',true),set_config('transaction_timeout','15000',true),set_config('idle_in_transaction_session_timeout','15000',true)";
const safeCode = value => typeof value === "string" && /^[A-Z0-9_]{2,80}$/.test(value) ? value : null;
const requireCheck = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { probeCode: code }); };
const settings = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "pid"));

/** Real executor plan/lock rehearsal. No adoption, replay, deploy or user SQL. */
export async function verifyMigrationLocks(connectionString, { connect = openMigrationConnection, set = loadMigrationSet(), timeoutMs = 30_000 } = {}) {
  requireCheck(Number.isSafeInteger(timeoutMs) && timeoutMs >= 50 && timeoutMs <= 30_000, "INVALID_PROBE_TIMEOUT");
  const started = Date.now(), connections = [], states = [], cleanupMs = Math.min(2_000, Math.max(10, Math.floor(timeoutMs / 5)));
  let expired = false, cancelDeadline;
  const timeoutError = Object.assign(new Error("PROBE_TIMEOUT"), { probeCode: "PROBE_TIMEOUT" });
  const expiredPromise = new Promise((_, reject) => { cancelDeadline = setTimeout(() => { expired = true; reject(timeoutError); }, timeoutMs - cleanupMs); });
  // A deadline can fire while connection establishment is still pending.
  void expiredPromise.catch(() => {});
  const bounded = operation => {
    if (expired) return Promise.reject(timeoutError);
    return Promise.race([Promise.resolve().then(operation), expiredPromise]);
  };
  const report = { result: "FAIL", mode: "READ ONLY SQL EXECUTOR / TWO NEON WEBSOCKET CONNECTIONS", checkedAt: new Date().toISOString(), migrationLock: [...migrationLock], timeoutMs, files: { historical: set.historical.length, future: set.future.length, unresolvedProvenance: set.unresolved.length }, checks: {}, plans: [], sessions: [], cleanup: [] };
  let phase = "connect";
  function observed(raw, label) {
    const state = { label, active: false, transaction: 0, transactionPid: null, baseline: null, rollbacks: 0, locks: [], samples: [] };
    states.push(state);
    async function sample(stage) {
      const row = (await bounded(() => raw.query(snapshotSql))).rows[0];
      requireCheck(Number.isInteger(row?.pid), "BACKEND_PID_MISSING");
      if (state.active) {
        state.transactionPid ??= row.pid;
        requireCheck(row.pid === state.transactionPid, "BACKEND_CHANGED_INSIDE_TRANSACTION");
        requireCheck(row.read_only === "on" && row.isolation === "read committed", "EXECUTOR_READ_ONLY_ISOLATION_DIFFERS");
      }
      state.samples.push({ stage, transaction: state.transaction, ...row });
      return row;
    }
    const connection = {
      async exec(sql) {
        requireCheck(sql === begin || sql === "ROLLBACK", "PROBE_REJECTED_TRANSACTION_COMMAND");
        const result = await bounded(() => raw.exec(sql));
        if (sql === begin) {
          requireCheck(!state.active, "NESTED_PROBE_TRANSACTION");
          state.active = true; state.transaction++; state.transactionPid = null;
          await sample("begin-read-only");
          // All bounds are transaction-local, also on pooled Neon URLs. The
          // executor then applies its own local settings without modification.
          await bounded(() => raw.query(localBounds));
          const boundedSnapshot = await sample("probe-local-bounds");
          requireCheck(boundedSnapshot.statement_timeout === "15s" && boundedSnapshot.lock_timeout === "250ms"
            && boundedSnapshot.transaction_timeout === "15s" && boundedSnapshot.idle_timeout === "15s", "PROBE_LOCAL_BOUNDS_DIFFER");
        } else {
          state.active = false; state.rollbacks++;
          const after = await sample("rollback");
          requireCheck(isDeepStrictEqual(settings(after), state.baseline), "LOCAL_SETTINGS_LEAKED_AFTER_ROLLBACK");
        }
        return result;
      },
      async query(sql, parameters) {
        // Reject writes before sending anything, including COMMIT, WITH/DML,
        // SELECT INTO and multi-statement strings. Only fixed internal SELECTs
        // are supplied by this probe and the actual executor's plan path.
        const statements = scanSql(sql);
        requireCheck(statements.length === 1 && statements[0].words[0] === "SELECT"
          && !statements[0].words.some(word => ["INTO", "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "TRUNCATE", "COPY", "CALL", "COMMIT", "ROLLBACK"].includes(word)), "PROBE_REJECTED_NON_READ_ONLY_SQL");
        if (sql === tryLock) requireCheck(isDeepStrictEqual(parameters, migrationLock), "WRONG_MIGRATION_LOCK_KEY");
        const result = await bounded(() => raw.query(sql, parameters));
        if (sql === tryLock) {
          state.locks.push({ transaction: state.transaction, acquired: result.rows[0]?.acquired });
          await sample("migration-lock");
        } else if (sql.includes("set_config('statement_timeout',$1,true)")) {
          const row = await sample("executor-configured");
          requireCheck(row.statement_timeout === "15s" && row.lock_timeout === "250ms" && ["1min", "60s"].includes(row.idle_timeout)
            && row.timezone === "UTC" && row.standard_strings === "on" && row.search_path === "public, pg_catalog", "EXECUTOR_LOCAL_SETTINGS_DIFFER");
        } else if (sql.includes("row_to_json(m)") || sql.startsWith("SELECT * FROM public._celeriflow_sql_")) {
          await sample("migration-metadata-read");
        }
        return result;
      },
    };
    return { connection, state, sample };
  }
  try {
    // Register each connection immediately so one failed open cannot orphan its
    // sibling. A connection that completes after timeout is closed on arrival.
    await bounded(() => Promise.all([0, 1].map(async index => {
      const raw = await connect(connectionString, "neon");
      connections[index] = raw;
      if (expired) { void Promise.resolve().then(() => raw.close()).catch(() => {}); throw timeoutError; }
    })));
    const owner = observed(connections[0], "owner"), contender = observed(connections[1], "executor-plan");
    for (const session of [owner, contender]) {
      session.state.baseline = settings(await session.sample("session-baseline"));
    }
    phase = "owner-lock";
    await owner.connection.exec(begin);
    requireCheck((await owner.connection.query(tryLock, migrationLock)).rows[0]?.acquired === true, "MIGRATION_LOCK_ALREADY_BUSY");
    report.checks.ownerReadOnly = true;
    phase = "contended-executor-plan";
    try {
      await runDatabaseMigrations(contender.connection, set, { command: "plan", statementTimeoutMs: 15_000, lockTimeoutMs: 250 });
      requireCheck(false, "CONTENDED_PLAN_DID_NOT_BLOCK");
    } catch (error) {
      if (!(error instanceof MigrationBlockedError) || error.report?.code !== "MIGRATION_LOCK_BUSY") throw error;
    }
    requireCheck(owner.state.transactionPid !== contender.state.transactionPid, "PROBE_BACKENDS_NOT_INDEPENDENT");
    requireCheck(contender.state.rollbacks === 1 && !contender.state.active, "CONTENDED_PLAN_DID_NOT_ROLL_BACK");
    report.checks.independentConcurrentBackends = true;
    report.checks.executorReportedMigrationLockBusy = true;
    report.checks.contendedPlanRolledBack = true;
    report.plans.push({ phase: "contended", result: "MIGRATION_LOCK_BUSY" });
    phase = "owner-release";
    await owner.connection.exec("ROLLBACK");
    phase = "released-executor-plan";
    const plan = await runDatabaseMigrations(contender.connection, set, { command: "plan", statementTimeoutMs: 15_000, lockTimeoutMs: 250 });
    requireCheck(contender.state.locks.at(-1)?.acquired === true && contender.state.rollbacks === 2 && !contender.state.active, "RELEASED_PLAN_DID_NOT_ACQUIRE_AND_ROLL_BACK");
    // Only counts/codes leave memory. Never print legacy JSON, log fields,
    // receipt contents, database names, connection strings or personal data.
    report.plans.push({ phase: "after-owner-rollback", result: plan.result, installed: plan.installed ?? null, issueCodes: [...new Set((plan.issues ?? []).map(issue => safeCode(issue.code)).filter(Boolean))] });
    report.checks.executorAcquiredAfterOwnerRollback = true;
    report.checks.uncontendedPlanRolledBack = true;
    report.checks.executorPlanReadOnly = true;
    report.checks.executorLocalTimeouts = true;
    phase = "verify-executor-release";
    await owner.connection.exec(begin);
    requireCheck((await owner.connection.query(tryLock, migrationLock)).rows[0]?.acquired === true, "EXECUTOR_ROLLBACK_DID_NOT_RELEASE_LOCK");
    await owner.connection.exec("ROLLBACK");
    report.checks.executorRollbackReleasedLockWhileConnectionOpen = true;
    report.checks.stableBackendsInsideEveryTransaction = true;
    report.checks.transactionLocalSettingsRestored = true;
    report.result = "PASS";
  } catch (error) {
    report.failure = { phase, code: expired ? "PROBE_TIMEOUT" : safeCode(error.probeCode) ?? safeCode(error.report?.code) ?? safeCode(error.code) ?? "READ_ONLY_PROBE_FAILED", executorResult: safeCode(error.report?.result) };
  } finally {
    clearTimeout(cancelDeadline);
    expired = true;
    // Cleanup is independent of the work deadline. End both transports even
    // when rollback is unacknowledged; never reconnect or retry a plan.
    const cleanup = connections.map(async (raw, index) => {
      const status = { connection: index + 1, rollback: "not-needed", closed: false };
      report.cleanup.push(status);
      let rollbackTimer;
      try {
        if (states[index]?.active) {
          status.rollback = "unacknowledged";
          const rolledBack = await Promise.race([
            Promise.resolve().then(() => raw.exec("ROLLBACK")).then(() => true),
            new Promise(resolve => { rollbackTimer = setTimeout(() => resolve(false), Math.max(1, Math.floor(cleanupMs / 2))); }),
          ]);
          if (rolledBack) status.rollback = "acknowledged";
        }
      } catch { /* closing the transport remains mandatory */ }
      finally {
        clearTimeout(rollbackTimer);
        try { await raw.close(); status.closed = true; } catch { /* recorded, never hide the primary failure */ }
      }
    });
    let timer;
    await Promise.race([Promise.allSettled(cleanup), new Promise(resolve => { timer = setTimeout(resolve, Math.max(1, Math.min(cleanupMs, timeoutMs - (Date.now() - started)))); })]);
    clearTimeout(timer);
    report.sessions = states.map(({ label, rollbacks, samples }) => ({ label, rollbacks, samples }));
    report.cleanupComplete = connections.length === 2 && report.cleanup.length === 2 && report.cleanup.every(status => status.closed && status.rollback !== "unacknowledged");
    if (!report.cleanupComplete) { report.result = "FAIL"; report.failure ??= { phase: "cleanup", code: "CONNECTION_CLEANUP_UNCONFIRMED", executorResult: null }; }
    report.elapsedMs = Date.now() - started;
  }
  return report;
}

async function main() {
  const options = { urlEnvironment: "DATABASE_MIGRATION_URL", output: null };
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Read-only SQL executor lock probe (PostgreSQL 17+).\nnode scripts/database-migrate-verify-locks.mjs [--url-env=DATABASE_URL] [--output=.agent/database-migrate-locks.json]\nDefault URL: DATABASE_MIGRATION_URL. Explicit --url-env selects DATABASE_URL for this probe only.\nQuiet .env.local/.env loading. Maximum 30 seconds, two Neon WebSocket connections, ROLLBACK only.");
    return;
  }
  for (const argument of args) {
    if (argument === "--url-env=DATABASE_URL") options.urlEnvironment = "DATABASE_URL";
    else if (argument.startsWith("--output=")) {
      const directory = resolve(repositoryRoot, ".agent"), output = resolve(repositoryRoot, argument.slice(9));
      requireCheck(output.startsWith(directory + sep) && output.endsWith(".json"), "OUTPUT_MUST_BE_AGENT_JSON");
      options.output = output;
    } else requireCheck(false, "UNKNOWN_PROBE_OPTION");
  }
  config({ path: resolve(repositoryRoot, ".env.local"), quiet: true });
  config({ path: resolve(repositoryRoot, ".env"), quiet: true });
  requireCheck(Boolean(process.env[options.urlEnvironment]), "PROBE_DATABASE_URL_MISSING");
  // A process watchdog also bounds driver/end() failures. Process termination
  // closes sockets; server-side transaction_timeout bounds the DB transaction.
  const watchdog = setTimeout(() => {
    const report = { result: "FAIL", failure: { phase: "process-watchdog", code: "PROBE_TIMEOUT" }, timeoutMs: 30_000 };
    if (options.output) { mkdirSync(dirname(options.output), { recursive: true }); writeFileSync(options.output, JSON.stringify(report, null, 2)); }
    console.error(JSON.stringify(report)); process.exit(1);
  }, 30_000);
  try {
    const report = await verifyMigrationLocks(process.env[options.urlEnvironment]);
    report.urlEnvironment = options.urlEnvironment;
    if (options.output) { mkdirSync(dirname(options.output), { recursive: true }); writeFileSync(options.output, JSON.stringify(report, null, 2)); }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.result === "PASS" ? 0 : 1;
    if (!report.cleanupComplete) process.exit(1);
  } finally { clearTimeout(watchdog); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(error => {
    console.error(JSON.stringify({ result: "FAIL", failure: { code: safeCode(error.probeCode) ?? safeCode(error.code) ?? "READ_ONLY_PROBE_FAILED" } }));
    process.exitCode = 1;
  });
}
