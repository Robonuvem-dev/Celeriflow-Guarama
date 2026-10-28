import { loadMigrationSet } from "../../../../scripts/database-migrate-files.mjs";
import { runDatabaseMigrations } from "../../../../scripts/database-migrate-core.mjs";
import { openMigrationConnection } from "../../../../scripts/database-migrate-driver.mjs";

export type MigrationInspectionConnection = Awaited<ReturnType<typeof openMigrationConnection>>;
export type MigrationInspectionSet = ReturnType<typeof loadMigrationSet>;
export type MigrationInspectionTimeouts = { statementTimeoutMs?: number; lockTimeoutMs?: number };
type ManagedPlan = { result: "PASS"; origin: string; recorded: number; pending: string[]; applied: string[] };

function isManagedPlan(report: unknown): report is ManagedPlan {
  return !!report && typeof report === "object" && "result" in report && report.result === "PASS"
    && "origin" in report && typeof report.origin === "string"
    && "recorded" in report && typeof report.recorded === "number"
    && "pending" in report && Array.isArray(report.pending) && report.pending.every(name => typeof name === "string")
    && "applied" in report && Array.isArray(report.applied) && report.applied.every(name => typeof name === "string");
}

/** Wrappers can inspect and confirm an authority noop, never execute scoped or
 * future SQL. Even if receipts regress between plan/deploy, only core transaction
 * controls/locks and SELECTs reach the original physical connection. */
function inspectionOnlyConnection(connection: MigrationInspectionConnection) {
  return {
    query: (...[statement, parameters]: Parameters<MigrationInspectionConnection["query"]>) => {
      if (typeof statement !== "string" || !/^SELECT\b/i.test(statement.trim())) throw new Error("Wrapper de inspeção não permite escrita SQL.");
      return connection.query(statement, parameters);
    },
    exec: (statement: string) => {
      if (!/^(?:BEGIN ISOLATION LEVEL READ COMMITTED(?: READ ONLY)?|ROLLBACK|COMMIT|LOCK TABLE public\._prisma_migrations IN SHARE MODE)$/.test(statement)) throw new Error("SQL pendente: execute npm run db:migrate:deploy explicitamente; este wrapper não aplica migrations.");
      return connection.exec(statement);
    },
  };
}

export async function inspectTaxFinalMigrationAuthority(connection: MigrationInspectionConnection, set: MigrationInspectionSet, names: readonly string[], apply = false, timeouts: MigrationInspectionTimeouts = {}) {
  for (const name of names) if (!set.migrations.some((migration: { name: string }) => migration.name === name)) throw new Error(`Migration não reconhecida pela autoridade SQL: ${name}`);
  const guarded = inspectionOnlyConnection(connection);
  const plan: unknown = await runDatabaseMigrations(guarded, set, { command: "plan", ...timeouts });
  const managed = isManagedPlan(plan);
  const migrations = names.map(name => ({ name, state: managed && !plan.pending.includes(name) ? "APPLIED_CHECKSUM_VERIFIED" : "PENDING" }));
  let deploy: unknown;
  if (apply) {
    if (!managed) throw new Error("Autoridade SQL não inicializada/verificada. Use npm run db:migrate:plan e o fluxo explícito da autoridade SQL.");
    if (plan.pending.length) throw new Error(`SQL pendente (${plan.pending.join(", ")}): execute npm run db:migrate:deploy explicitamente; este wrapper não aplica migrations de nenhum escopo.`);
    deploy = await runDatabaseMigrations(guarded, set, { command: "deploy", ...timeouts });
  }
  return { migrations, authority: plan, ...(apply ? { deploy, execution: "SQL_AUTHORITY_NOOP" } : { execution: "READ_ONLY_INSPECTION" }) };
}

/** CLI owns only connection acquisition/cleanup. Locking, provenance (including
 * LF/CRLF and reviewed historical differences) and rollback belong to core. */
export async function withTaxFinalMigrationInspection<T>(apply: boolean, inspect: (connection: MigrationInspectionConnection, set: MigrationInspectionSet, timeouts: MigrationInspectionTimeouts) => Promise<T>, environment = process.env) {
  if (apply && (environment.VERCEL_ENV === "preview" || (environment.VERCEL === "1" && environment.VERCEL_ENV !== "production"))) throw new Error("Vercel database migrations run only in the production deployment stage");
  const url = environment.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL is required; there is no automatic database fallback");
  const statementTimeoutMs = Number(environment.DATABASE_MIGRATION_STATEMENT_TIMEOUT_MS ?? 300_000);
  const lockTimeoutMs = Number(environment.DATABASE_MIGRATION_LOCK_TIMEOUT_MS ?? 10_000);
  if (![statementTimeoutMs, lockTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("Invalid migration timeout environment variable");
  const set = loadMigrationSet();
  const connection = await openMigrationConnection(url, environment.DATABASE_MIGRATION_DRIVER ?? "neon");
  try { return await inspect(connection, set, { statementTimeoutMs, lockTimeoutMs }); }
  finally { await connection.close().catch(() => {}); }
}
