import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";

test("native rehearsal savepoints recover SQL failures and outer rollback removes successful service writes", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const rollback = new Error("ROLLBACK_REHEARSAL");
  try {
    await fixture.database.exec("CREATE TABLE rehearsal_probe (id text PRIMARY KEY)");
    await assert.rejects(withDatabaseTransaction(fixture.connection, tx =>
      inDatabaseTransactionScope(fixture.connection, tx, async () => {
        await withDatabaseTransaction(fixture.connection, async nested => {
          await nested.execute(sql`INSERT INTO rehearsal_probe VALUES ('first')`);
        });
        await assert.rejects(withDatabaseTransaction(fixture.connection, async nested => {
          await nested.execute(sql`INSERT INTO rehearsal_probe VALUES ('discarded')`);
          await nested.execute(sql`INSERT INTO rehearsal_probe VALUES ('first')`);
        }));
        // A failed PostgreSQL statement must not poison the outer transaction.
        await withDatabaseTransaction(fixture.connection, async nested => {
          await nested.execute(sql`INSERT INTO rehearsal_probe VALUES ('after-error')`);
        });
        const rows = await tx.execute<{ id: string }>(sql`SELECT id FROM rehearsal_probe ORDER BY id`);
        assert.deepEqual(rows.rows.map(row => row.id), ["after-error", "first"]);
        throw rollback;
      })), error => error === rollback);
    const rows = await fixture.connection.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM rehearsal_probe`);
    assert.equal(rows.rows[0].count, 0);
  } finally { await fixture.close(); }
});
