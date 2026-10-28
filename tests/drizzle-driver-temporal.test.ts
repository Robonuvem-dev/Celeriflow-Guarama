import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { date, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { databaseTimestamp } from "../src/db/temporal";

const temporal = pgTable("TemporalDriverContract", {
  id: text("id").primaryKey(),
  naive: timestamp("naive", { precision: 3 }).notNull(),
  zoned: timestamp("zoned", { precision: 3, withTimezone: true }).notNull(),
  day: date("day", { mode: "date" }).notNull(),
});

test("real Neon/Drizzle parameter and result contracts preserve timestamp/date UTC in three host timezones", { timeout: 60_000 }, async () => {
  const timezone = process.env.TZ;
  const fixture = await createLocalDrizzleDatabase();
  const value = new Date("2026-01-01T01:23:45.678Z");
  try {
    await fixture.database.exec('CREATE TABLE "TemporalDriverContract" (id text PRIMARY KEY, naive timestamp(3) NOT NULL, zoned timestamptz(3) NOT NULL, day date NOT NULL)');
    for (const zone of ["UTC", "America/Sao_Paulo", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      const raw = (await fixture.connection.db.execute<{ naive: string; zoned: string; day: string; dates: string[]; boundaryExcluded: boolean }>(sql`
        SELECT ${value}::timestamp AS naive, ${value}::timestamptz AS zoned, ${value}::date AS day,
          ARRAY[${value}::timestamp]::text[] AS dates,
          NOT (TIMESTAMP '2026-01-01 01:23:45.678' > ${value}) AS "boundaryExcluded"
      `)).rows[0];
      assert.equal(raw.naive, "2026-01-01 01:23:45.678", zone);
      assert.equal(raw.day, "2026-01-01", zone);
      assert.deepEqual(raw.dates, ["2026-01-01 01:23:45.678"], zone);
      assert.equal(raw.boundaryExcluded, true, `Validity expires exactly at the reference instant: ${zone}`);
      assert.equal(databaseTimestamp(raw.zoned).toISOString(), value.toISOString(), zone);
      const [inserted] = await fixture.connection.db.insert(temporal).values({ id: zone, naive: value, zoned: value, day: value }).returning();
      assert.equal(inserted.naive.toISOString(), value.toISOString(), zone);
      assert.equal(inserted.zoned.toISOString(), value.toISOString(), zone);
      assert.equal(inserted.day.toISOString(), "2026-01-01T00:00:00.000Z", zone);
    }
  } finally {
    if (timezone === undefined) delete process.env.TZ;
    else process.env.TZ = timezone;
    await fixture.close();
  }
});
