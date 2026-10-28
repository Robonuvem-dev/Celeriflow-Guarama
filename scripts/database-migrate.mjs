import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadMigrationSet } from "./database-migrate-files.mjs";
import { loadBaselineCatalog } from "./database-migrate-catalog.mjs";
import { MigrationBlockedError, runDatabaseMigrations } from "./database-migrate-core.mjs";
import { openMigrationConnection } from "./database-migrate-driver.mjs";
import { validateAuditedBaseline } from "./database-migrate-baseline.mjs";

const help = `Explicit SQL migration authority (no Prisma runtime/CLI)

  node scripts/database-migrate.mjs verify-files
  node scripts/database-migrate.mjs plan [--catalog=<file> --catalog-sha256=<sha256>]
  node scripts/database-migrate.mjs adopt --catalog=<file> --catalog-sha256=<sha256>
  node scripts/database-migrate.mjs baseline --catalog=<file> --catalog-sha256=<sha256> --baseline-manifest-digest=<sha256>
  node scripts/database-migrate.mjs replay
  node scripts/database-migrate.mjs deploy

DATABASE_MIGRATION_URL                 Explicit destination, preferably unpooled.
DATABASE_MIGRATION_DRIVER              neon (WebSocket, default) or pg (TCP).
DATABASE_MIGRATION_STATEMENT_TIMEOUT_MS 300000 by default, positive integer.
DATABASE_MIGRATION_LOCK_TIMEOUT_MS      10000 by default, positive integer.

No .env files or DATABASE_URL fallback are loaded. Preview Vercel writes are
rejected. Adoption only writes new authority receipts after full validation;
it never executes historical SQL or edits the installed _prisma_migrations.
Exit codes: 0 success, 2 known adoption/authority blocker, 1 other failure.
See docs/drizzle-ddl-progress.md for the unresolved historical baseline.`;

function parseOptions(arguments_) {
  const [command, ...rest] = arguments_;
  if (!["verify-files", "plan", "adopt", "baseline", "replay", "deploy"].includes(command)) throw new Error("Unknown migration command; use --help");
  const options = {};
  for (const argument of rest) {
    const match = argument.match(/^--(catalog|catalog-sha256|baseline-manifest-digest)=(.+)$/);
    if (!match || options[match[1]]) throw new Error("Unknown or repeated migration option");
    options[match[1]] = match[2];
  }
  if ((options.catalog || options["catalog-sha256"]) && (!["plan", "adopt", "baseline"].includes(command) || !options.catalog || !options["catalog-sha256"])) {
    throw new Error("Both catalog options are required together, only for plan/adopt/baseline");
  }
  if (options["baseline-manifest-digest"] && (!["plan", "baseline"].includes(command) || !/^[0-9a-f]{64}$/.test(options["baseline-manifest-digest"]))) throw new Error("Baseline manifest digest must be a SHA-256, only for explicit plan/baseline");
  if ((command === "baseline" || options["baseline-manifest-digest"]) && (!options.catalog || !options["catalog-sha256"] || !options["baseline-manifest-digest"])) throw new Error("Audited baseline requires original reviewed catalog, file SHA-256 and explicit manifest digest");
  return { command, options };
}

export async function databaseMigrateMain(arguments_ = process.argv.slice(2), environment = process.env) {
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0])) { console.log(help); return 0; }
  const { command, options } = parseOptions(arguments_);
  const set = loadMigrationSet();
  if (command === "verify-files") {
    // File integrity and an explicit baseline authorization are offline checks;
    // only plan/baseline/deploy can certify the connected database's authority.
    const baseline = set.unresolved.length && set.auditedBaseline ? validateAuditedBaseline(set) : undefined;
    console.log(JSON.stringify({ result: set.unresolved.length ? baseline ? "FILES_INTACT_BASELINE_AUTHORIZED" : "FILES_INTACT_ADOPTION_BLOCKED" : "FILES_INTACT", historical: set.historical.length, future: set.future.length, baselineDigest: set.baselineDigest, historicalDifferences: set.unresolved, provenHistoricalVariants: set.provenHistoricalVariants, priorRecovery: set.policy.recoveryReport, ...(baseline ? { baselineManifestDigest: baseline.digest, strictAdoption: "BLOCKED", databaseAuthority: "NOT_CHECKED" } : {}) }, null, 2));
    return set.unresolved.length && !baseline ? 2 : 0;
  }
  if (command !== "plan" && (environment.VERCEL_ENV === "preview" || (environment.VERCEL === "1" && environment.VERCEL_ENV !== "production"))) {
    throw new Error("Vercel database migrations run only in the production deployment stage");
  }
  const connectionString = environment.DATABASE_MIGRATION_URL;
  if (!connectionString) throw new Error("DATABASE_MIGRATION_URL is required; there is no automatic database fallback");
  const baselineCatalog = options.catalog ? loadBaselineCatalog(options.catalog, options["catalog-sha256"]) : undefined;
  const statementTimeoutMs = Number(environment.DATABASE_MIGRATION_STATEMENT_TIMEOUT_MS ?? 300_000);
  const lockTimeoutMs = Number(environment.DATABASE_MIGRATION_LOCK_TIMEOUT_MS ?? 10_000);
  if (![statementTimeoutMs, lockTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("Invalid migration timeout environment variable");
  const connection = await openMigrationConnection(connectionString, environment.DATABASE_MIGRATION_DRIVER ?? "neon");
  try {
    const report = await runDatabaseMigrations(connection, set, { command, baselineCatalog, baselineManifestDigest: options["baseline-manifest-digest"], statementTimeoutMs, lockTimeoutMs });
    console.log(JSON.stringify({ command, ...report }, null, 2));
    return ["ADOPTION_BLOCKED", "BASELINE_BLOCKED"].includes(report.result) ? 2 : 0;
  } finally {
    // Cleanup must not replace an OUTCOME_UNKNOWN/rollback diagnostic after a
    // socket failure. A confirmed commit is not undone by failure to close.
    await connection.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await databaseMigrateMain(); }
  catch (error) {
    if (error instanceof MigrationBlockedError) {
      console.error(JSON.stringify({ message: error.message, ...error.report }, null, 2));
      process.exitCode = error.report.result === "OUTCOME_UNKNOWN" ? 1 : 2;
    } else {
      // Do not print driver messages/stack traces or connection strings.
      console.error(JSON.stringify({ result: "ERROR", message: error.code ? "PostgreSQL migration connection/operation failed" : error.message, code: error.code ?? null }, null, 2));
      process.exitCode = 1;
    }
  }
}
