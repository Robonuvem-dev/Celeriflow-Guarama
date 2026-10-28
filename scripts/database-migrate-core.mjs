import { sha256, stableJson } from "./database-migrate-files.mjs";
import { compareMigrationCatalog } from "./database-migrate-catalog.mjs";
import { baselineReceiptProvenance, validateAuditedBaseline } from "./database-migrate-baseline.mjs";

export const migrationLock = [1866280812, 1936813409];
const stateName = "public._celeriflow_sql_state";
const receiptName = "public._celeriflow_sql_migrations";
const legacyName = "public._prisma_migrations";

export class MigrationBlockedError extends Error {
  constructor(message, report) {
    super(message);
    this.name = "MigrationBlockedError";
    this.report = report;
  }
}
function blocked(message, detail = {}) { throw new MigrationBlockedError(message, { result: "BLOCKED", ...detail }); }
async function exists(connection, name) {
  return (await connection.query("SELECT to_regclass($1) IS NOT NULL AS present", [name])).rows[0].present;
}
async function readLegacy(connection, timezone) {
  if (!await exists(connection, legacyName)) return null;
  // JSON text preserves every column, including full timestamp precision. No
  // timestamp is converted through JS Date. Preserve the adoption session's
  // original timezone representation too, independently of the runner's UTC
  // settings and of the timezone used by a later deploy connection.
  await connection.query("SELECT set_config('timezone',$1,true)", [timezone]);
  const rows = (await connection.query(`SELECT row_to_json(m)::text AS document FROM public._prisma_migrations m ORDER BY migration_name,id`)).rows;
  await connection.query("SELECT set_config('timezone','UTC',true)");
  return rows.map(row => JSON.parse(row.document));
}
function legacyDigest(rows) { return sha256(stableJson(rows)); }

function auditedBaseline(set, options) {
  try { return validateAuditedBaseline(set, options); }
  catch (error) { blocked(error.message, { code: "BASELINE_MANIFEST_INVALID" }); }
}

function auditLegacy(set, rows) {
  const issues = [];
  if (!rows) return [{ code: "LEGACY_LEDGER_MISSING" }];
  const known = new Map(set.historical.map(migration => [migration.name, migration]));
  const seen = new Set();
  for (const row of rows) {
    const migration = known.get(row.migration_name);
    if (!migration) { issues.push({ code: "UNKNOWN_LEGACY_MIGRATION", name: row.migration_name }); continue; }
    if (seen.has(row.migration_name)) issues.push({ code: "DUPLICATE_LEGACY_MIGRATION", name: row.migration_name });
    seen.add(row.migration_name);
    if (!row.id || !row.started_at || !row.finished_at || row.rolled_back_at) issues.push({ code: "INCOMPLETE_LEGACY_MIGRATION", name: row.migration_name });
    if (row.checksum !== migration.provenance.installedChecksum) issues.push({ code: "INSTALLED_CHECKSUM_CHANGED", name: row.migration_name, expected: migration.provenance.installedChecksum, actual: row.checksum });
  }
  for (const migration of set.historical) if (!seen.has(migration.name)) issues.push({ code: "MISSING_LEGACY_MIGRATION", name: migration.name });
  for (const difference of set.unresolved) issues.push({ code: "UNRESOLVED_HISTORICAL_DIFFERENCE", ...difference });
  return issues;
}

async function createLedger(connection, set, origin, provenance) {
  // Deliberately no IF NOT EXISTS: a pre-existing unrecognized table must never
  // be adopted as this runner's ledger, even if the name happens to match.
  await connection.exec(`CREATE TABLE public._celeriflow_sql_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    format_version integer NOT NULL CHECK (format_version = 1),
    authority text NOT NULL CHECK (authority = 'celeriflow-explicit-sql-v1'),
    origin text NOT NULL CHECK (origin IN ('adopted','replayed','baselined')),
    baseline_digest text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
    provenance jsonb NOT NULL,
    initialized_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE TABLE public._celeriflow_sql_migrations (
    name text PRIMARY KEY,
    position integer NOT NULL UNIQUE CHECK (position > 0),
    source text NOT NULL,
    checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    lf_checksum text NOT NULL CHECK (lf_checksum ~ '^[0-9a-f]{64}$'),
    origin text NOT NULL CHECK (origin IN ('adopted','executed','baselined')),
    legacy_row jsonb,
    historical_provenance jsonb,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((origin IN ('adopted','baselined')) = (legacy_row IS NOT NULL))
  );`);
  await connection.query(`INSERT INTO public._celeriflow_sql_state (format_version,authority,origin,baseline_digest,provenance) VALUES (1,$1,$2,$3,$4::jsonb)`, [set.policy.authority, origin, set.baselineDigest, JSON.stringify(provenance)]);
}
async function insertReceipt(connection, migration, position, legacyRow = null, authorization = null) {
  const proof = authorization ? baselineReceiptProvenance(migration, authorization) : migration.historicalProof ?? null;
  await connection.query(`INSERT INTO public._celeriflow_sql_migrations (name,position,source,checksum,lf_checksum,origin,legacy_row,historical_provenance) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`, [migration.name, position, migration.source, migration.checksum, migration.lfChecksum, authorization ? "baselined" : legacyRow ? "adopted" : "executed", legacyRow ? JSON.stringify(legacyRow) : null, proof ? JSON.stringify(proof) : null]);
}
async function readManaged(connection, set, legacyRows) {
  const states = (await connection.query(`SELECT * FROM public._celeriflow_sql_state`)).rows;
  if (states.length !== 1 || states[0].format_version !== 1 || states[0].authority !== set.policy.authority || states[0].baseline_digest !== set.baselineDigest || !["adopted", "replayed", "baselined"].includes(states[0].origin)) {
    blocked("SQL authority/baseline marker is not recognized");
  }
  const state = states[0];
  let authorization;
  if (state.origin === "baselined") {
    authorization = auditedBaseline(set);
    if (stableJson(state.provenance.auditedBaseline) !== stableJson(authorization)
      || state.provenance.historySha256 !== set.historySha256
      || state.provenance.catalogSha256 !== authorization.manifest.reviewedCatalog.fileSha256
      || state.provenance.catalogDigest !== authorization.manifest.reviewedCatalog.digest) blocked("Audited baseline authorization/catalog binding changed after initialization");
  }
  if (stableJson(state.provenance.provenHistoricalVariants ?? []) !== stableJson(set.provenHistoricalVariants ?? [])) blocked("Archived historical byte provenance changed after initialization");
  if (["adopted", "baselined"].includes(state.origin)) {
    const issues = auditLegacy(set, legacyRows).filter(issue => !(authorization && issue.code === "UNRESOLVED_HISTORICAL_DIFFERENCE"));
    if (issues.length || legacyDigest(legacyRows) !== state.provenance.legacyDigest) blocked("The preserved installed ledger changed after initialization", { issues });
  } else if (legacyRows !== null) blocked("A second migration authority appeared after empty replay");
  const receipts = (await connection.query(`SELECT * FROM public._celeriflow_sql_migrations ORDER BY position`)).rows;
  if (receipts.length < set.historical.length || receipts.length > set.migrations.length) blocked("SQL receipts are not a complete known baseline/prefix");
  for (let index = 0; index < receipts.length; index++) {
    const receipt = receipts[index], migration = set.migrations[index];
    const expectedOrigin = ["adopted", "baselined"].includes(state.origin) && migration.historical ? state.origin : "executed";
    // Historical checkout LF/CRLF variants remain explicitly known. Every new
    // migration, for every authority origin, must match its exact execution bytes.
    const checksumMatches = migration.historical ? migration.byteVariants.includes(receipt.checksum) : receipt.checksum === migration.checksum;
    if (receipt.position !== index + 1 || receipt.name !== migration.name || receipt.source !== migration.source
      || receipt.lf_checksum !== migration.lfChecksum || !checksumMatches || receipt.origin !== expectedOrigin) {
      blocked("Unknown, reordered or changed SQL receipt/source", { name: receipt.name, position: receipt.position });
    }
    const expectedProof = expectedOrigin === "baselined" ? baselineReceiptProvenance(migration, authorization) : migration.historicalProof ?? null;
    if (stableJson(receipt.historical_provenance) !== stableJson(expectedProof)) blocked("SQL receipt historical byte proof changed", { name: receipt.name });
    if (["adopted", "baselined"].includes(expectedOrigin)) {
      const original = legacyRows.find(row => row.migration_name === receipt.name);
      if (stableJson(receipt.legacy_row) !== stableJson(original)) blocked("Preserved receipt no longer matches the installed row", { name: receipt.name });
    } else if (receipt.legacy_row !== null) blocked("Executed SQL receipt has unexpected legacy provenance", { name: receipt.name });
  }
  return { state, receipts, pending: set.migrations.slice(receipts.length) };
}
async function assertEmpty(connection) {
  const { rows } = await connection.query(`
    SELECT 'relation' AS kind,n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
    UNION ALL SELECT 'function',n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
    UNION ALL SELECT 'type',n.nspname,t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
    UNION ALL SELECT 'schema',nspname,nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','public') AND nspname !~ '^pg_'
    UNION ALL SELECT 'extension','',extname FROM pg_extension WHERE extname <> 'plpgsql' LIMIT 20`);
  if (rows.length) blocked("Empty replay requires a genuinely empty database", { objects: rows });
}
async function apply(connection, migrations, offset) {
  const applied = [];
  for (let index = 0; index < migrations.length; index++) {
    const migration = migrations[index];
    try {
      await connection.exec(migration.executionSql);
      await insertReceipt(connection, migration, offset + index + 1);
    } catch (error) {
      // Keep DB code/name for operations, without logging SQL or connection URLs.
      throw new MigrationBlockedError(`SQL migration failed: ${migration.name} [${error.code ?? "unknown"}]`, { result: "ROLLED_BACK", name: migration.name, databaseCode: error.code ?? null, databaseMessage: error.message });
    }
    applied.push(migration.name);
  }
  return applied;
}

export async function runDatabaseMigrations(connection, set, { command, baselineCatalog, baselineManifestDigest, statementTimeoutMs = 300_000, lockTimeoutMs = 10_000 } = {}) {
  if (!["plan", "adopt", "baseline", "replay", "deploy"].includes(command)) throw new Error("Expected plan, adopt, baseline, replay or deploy");
  if (baselineManifestDigest !== undefined && !["plan", "baseline"].includes(command)) throw new Error("Explicit baseline manifest digest is only valid for plan/baseline");
  for (const value of [statementTimeoutMs, lockTimeoutMs]) if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Migration timeouts must be positive safe integer milliseconds");
  let began = false, committing = false;
  try {
    // READ COMMITTED: every catalog/ledger read occurs after lock acquisition.
    // A snapshot taken before a previous deploy commits must not hide receipts.
    await connection.exec(command === "plan" ? "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    const sessionTimezone = (await connection.query("SELECT current_setting('timezone') AS timezone")).rows[0].timezone;
    await connection.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout','60000',true),set_config('search_path','public, pg_catalog',true),set_config('timezone','UTC',true),set_config('standard_conforming_strings','on',true)", [String(statementTimeoutMs), String(lockTimeoutMs)]);
    const lock = (await connection.query("SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS acquired", migrationLock)).rows[0];
    if (!lock.acquired) blocked("Another SQL migration holds the transactional lock", { code: "MIGRATION_LOCK_BUSY" });
    const hasState = await exists(connection, stateName), hasReceipts = await exists(connection, receiptName);
    if (hasState !== hasReceipts) blocked("Incomplete/unrecognized SQL authority tables");
    if (command !== "plan" && await exists(connection, legacyName)) {
      // Freeze the installed provenance while adopting/deploying. A legacy
      // migrator trying to append rows must not race the new authority.
      await connection.exec("LOCK TABLE public._prisma_migrations IN SHARE MODE");
    }
    const legacyTimezone = hasState
      ? (await connection.query("SELECT provenance->>'legacyTimezone' AS timezone FROM public._celeriflow_sql_state WHERE singleton=true")).rows[0]?.timezone ?? "UTC"
      : sessionTimezone;
    const legacyRows = await readLegacy(connection, legacyTimezone);
    const provenance = { historySha256: set.historySha256, recoveryReport: set.policy.recoveryReport, provenHistoricalVariants: set.provenHistoricalVariants ?? [], legacyTimezone };
    let report;
    if (hasState) {
      const managed = await readManaged(connection, set, legacyRows);
      if (["adopt", "baseline", "replay"].includes(command)) blocked("SQL authority is already initialized; use deploy or plan");
      const applied = command === "deploy" ? await apply(connection, managed.pending, managed.receipts.length) : [];
      report = { result: "PASS", origin: managed.state.origin, recorded: managed.receipts.length, pending: managed.pending.map(migration => migration.name), applied, provenHistoricalVariants: set.provenHistoricalVariants ?? [], ...(managed.state.origin === "baselined" ? { baselineManifestDigest: managed.state.provenance.auditedBaseline.digest, historicalDifferences: set.unresolved } : {}) };
    } else if (command === "replay") {
      await assertEmpty(connection);
      await createLedger(connection, set, "replayed", provenance);
      report = { result: "PASS", origin: "replayed", applied: await apply(connection, set.migrations, 0), note: "Local SQL sources executed; unresolved installed checksums are not approved by replay.", historicalDifferences: set.unresolved, provenHistoricalVariants: set.provenHistoricalVariants ?? [] };
    } else if (command === "deploy") {
      blocked("Database has no SQL authority marker; explicitly initialize the existing database or replay an empty one", { code: "INITIALIZATION_REQUIRED", historicalDifferences: set.unresolved, provenHistoricalVariants: set.provenHistoricalVariants ?? [] });
    } else if (command === "baseline" || command === "plan" && baselineManifestDigest !== undefined) {
      if (!baselineManifestDigest) blocked("Explicit audited baseline manifest digest required", { code: "BASELINE_MANIFEST_REQUIRED" });
      if (!baselineCatalog) blocked("Original reviewed catalog and file SHA-256 required for audited baseline initialization", { code: "REVIEWED_BASELINE_CATALOG_REQUIRED" });
      const authorization = auditedBaseline(set, { catalog: baselineCatalog, requestedDigest: baselineManifestDigest });
      // Only the exact unresolved tuples validated above are reconciled. Ledger
      // checksum changes, unknown/duplicate/incomplete/missing rows still block.
      const issues = auditLegacy(set, legacyRows).filter(issue => issue.code !== "UNRESOLVED_HISTORICAL_DIFFERENCE");
      const catalog = await compareMigrationCatalog(connection, baselineCatalog);
      if (catalog.differences.length || catalog.digest !== authorization.manifest.reviewedCatalog.digest) issues.push({ code: "CATALOG_DIFFERS_FROM_BASELINE", groups: catalog.differences });
      report = { result: issues.length ? "BASELINE_BLOCKED" : "READY_TO_BASELINE", installed: legacyRows?.length ?? 0, issues, catalog, baselineManifestDigest: authorization.digest, historicalDifferences: set.unresolved, provenHistoricalVariants: set.provenHistoricalVariants ?? [], pendingAfterBaseline: set.future.map(migration => migration.name) };
      if (command === "baseline") {
        if (issues.length) blocked("Audited baseline initialization blocked; no authority tables or receipts were written", report);
        await createLedger(connection, set, "baselined", { ...provenance, legacyDigest: legacyDigest(legacyRows), catalogSha256: baselineCatalog.fileSha256, catalogDigest: catalog.digest, auditedBaseline: authorization });
        for (let index = 0; index < set.historical.length; index++) {
          const migration = set.historical[index];
          await insertReceipt(connection, migration, index + 1, legacyRows.find(row => row.migration_name === migration.name), authorization);
        }
        report = { ...report, result: "PASS", origin: "baselined", baselined: set.historical.length, applied: [], note: "Audited current state initialized; unresolved historical bytes remain unproven. No historical SQL executed." };
      }
    } else {
      const issues = auditLegacy(set, legacyRows);
      let catalog;
      if (!baselineCatalog) issues.push({ code: "REVIEWED_BASELINE_CATALOG_REQUIRED" });
      else {
        catalog = await compareMigrationCatalog(connection, baselineCatalog);
        if (catalog.differences.length) issues.push({ code: "CATALOG_DIFFERS_FROM_BASELINE", groups: catalog.differences });
      }
      report = { result: issues.length ? "ADOPTION_BLOCKED" : "READY_TO_ADOPT", installed: legacyRows?.length ?? 0, issues, catalog, provenHistoricalVariants: set.provenHistoricalVariants ?? [], pendingAfterAdoption: set.future.map(migration => migration.name) };
      if (command === "adopt") {
        if (issues.length) blocked("Existing database adoption is blocked; no authority tables or receipts were written", report);
        await createLedger(connection, set, "adopted", { ...provenance, legacyDigest: legacyDigest(legacyRows), catalogSha256: baselineCatalog.fileSha256, catalogDigest: catalog.digest });
        for (let index = 0; index < set.historical.length; index++) {
          const migration = set.historical[index];
          await insertReceipt(connection, migration, index + 1, legacyRows.find(row => row.migration_name === migration.name));
        }
        report = { ...report, result: "PASS", origin: "adopted", adopted: set.historical.length, applied: [] };
      }
    }
    committing = command !== "plan";
    await connection.exec(command === "plan" ? "ROLLBACK" : "COMMIT");
    began = false;
    return report;
  } catch (error) {
    if (began) {
      try { await connection.exec("ROLLBACK"); }
      catch { throw new MigrationBlockedError("Connection lost during migration/rollback; transaction outcome must be checked before retry", { result: "OUTCOME_UNKNOWN" }); }
    }
    if (committing) throw new MigrationBlockedError("COMMIT was not acknowledged; inspect the SQL receipts before retrying", { result: "OUTCOME_UNKNOWN" });
    throw error;
  }
}
