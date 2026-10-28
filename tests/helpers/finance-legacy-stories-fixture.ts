import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction, type DatabaseExecutor } from "../../src/db/transaction";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Read-only physical oracles taken from the original SQL history, independently
 * of the Drizzle mappings. They never generate or repair the installed schema. */
async function assertHistoricalFinanceMetadata(db: DatabaseExecutor) {
  const columns = await db.execute<{ tableName: string; columnName: string; typeName: string; notNull: boolean }>(sql`
    SELECT c.relname AS "tableName", a.attname AS "columnName",
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS "typeName", a.attnotnull AS "notNull"
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT a.attisdropped AND a.attnum > 0
      AND (c.relname, a.attname) IN (
        ('Commitment', 'value'), ('Commitment', 'valueDecimal'),
        ('FinancialYear', 'governmentEntityId'), ('MonthlyAccountingClose', 'competence'),
        ('TreasuryMovement', 'resourceSourceId'), ('TreasuryMovement', 'valueDecimal')
      )
    ORDER BY c.relname, a.attname
  `);
  assert.deepEqual(columns.rows, [
    { tableName: "Commitment", columnName: "value", typeName: "double precision", notNull: true },
    { tableName: "Commitment", columnName: "valueDecimal", typeName: "numeric(18,2)", notNull: false },
    { tableName: "FinancialYear", columnName: "governmentEntityId", typeName: "text", notNull: false },
    { tableName: "MonthlyAccountingClose", columnName: "competence", typeName: "timestamp(3) without time zone", notNull: true },
    { tableName: "TreasuryMovement", columnName: "resourceSourceId", typeName: "text", notNull: false },
    { tableName: "TreasuryMovement", columnName: "valueDecimal", typeName: "numeric(18,2)", notNull: true },
  ]);
  const triggers = await db.execute<{ name: string; enabled: string }>(sql`
    SELECT t.tgname AS name, t.tgenabled::text AS enabled
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND (c.relname, t.tgname) IN (
        ('FinancialAuditLog', 'FinancialAuditLog_append_only'),
        ('TreasuryMovement', 'TreasuryMovement_multisource_origin_guard')
      )
    ORDER BY t.tgname
  `);
  assert.deepEqual(triggers.rows, [
    { name: "FinancialAuditLog_append_only", enabled: "O" },
    { name: "TreasuryMovement_multisource_origin_guard", enabled: "O" },
  ]);
}

/** One disposable database per story file. Replay all 156 original migrations,
 * then load the frozen SQL seed in one real Neon/Drizzle transaction. Await
 * close() before another fixture in the same process: Neon transport is global. */
export async function createFinanceLegacyStoriesFixture() {
  const previousAccountingMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  const restoreAccountingMode = () => {
    if (previousAccountingMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousAccountingMode;
  };
  // These historical stories explicitly exercise reference rules in POC mode.
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let local: Awaited<ReturnType<typeof createLocalDrizzleDatabase>> | undefined;
  try {
    local = await createLocalDrizzleDatabase();
    const connectionString = local.connection.pool.options.connectionString;
    assert.ok(connectionString, "O pool da fixture deve expor sua URL local.");
    const target = new URL(connectionString);
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.pathname, "/postgres");
    assert.equal(target.searchParams.get("sslmode"), "disable");
    const migrationRoot = join("prisma", "migrations-ibema");
    const history = readdirSync(migrationRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.equal(history.length, 156, "A fixture exige os 156 SQL históricos originais.");
    for (const name of history) {
      try { await local.database.exec(readFileSync(join(migrationRoot, name, "migration.sql"), "utf8")); }
      catch (cause) { throw new Error(`Falha no replay financeiro histórico: ${name}`, { cause }); }
    }
    await assertHistoricalFinanceMetadata(local.connection.db);
    const seed = readFileSync(join("tests", "fixtures", "finance-legacy-stories.sql"), "utf8");
    await withDatabaseTransaction(local.connection, async tx => {
      await tx.execute(sql.raw(seed));
    }, { timeoutMs: 120_000, lockTimeoutMs: 120_000 });
    const opened = local;
    let closing: Promise<void> | undefined;
    return {
      connection: opened.connection,
      connectionString,
      history,
      close() {
        return closing ??= (async () => {
          try { await opened.close(); }
          finally { restoreAccountingMode(); }
        })();
      },
    };
  } catch (error) {
    try { await local?.close(); }
    finally { restoreAccountingMode(); }
    throw error;
  }
}
