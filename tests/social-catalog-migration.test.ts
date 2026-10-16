import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("migration SUAS aplica e protege vigências e valores salariais", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("prisma/migrations-ibema/20261010050000_social_suas_catalogs/migration.sql", "utf8"));
    const insert = 'INSERT INTO "SocialMinimumWage" (id, "validFrom", value, "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)';
    await db.query(insert, ["first", "2026-01-01", "1621.00"]);
    await assert.rejects(db.query(insert, ["duplicate", "2026-01-01", "1700.00"]));
    await assert.rejects(db.query(insert, ["negative", "2026-02-01", "-1.00"]));
    const rows = await db.query<{ value: string }>('SELECT value::text FROM "SocialMinimumWage"');
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].value, "1621.00");
  } finally {
    await db.close();
  }
});
