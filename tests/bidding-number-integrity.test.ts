import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { biddings } from "../src/db/schema/procurement-core";
import {
  BIDDING_NUMBER_DUPLICATE_ERROR,
  biddingNumberDuplicateError,
} from "../src/lib/compras/bidding-number-integrity";

const migrationPath = "prisma/migrations/20260919220000_add_bidding_number_uniqueness/migration.sql";

test("Bidding number conflicts return a client-safe error", () => {
  assert.deepEqual(biddingNumberDuplicateError({ cause: { code: "23505" } }), {
    error: BIDDING_NUMBER_DUPLICATE_ERROR,
  });
  assert.equal(biddingNumberDuplicateError({ code: "23503" }), null);
});

test("Bidding number migration creates a unique public identifier", async () => {
  const f = await createLocalDrizzleDatabase();
  try {
    await f.database.exec('CREATE TABLE "Bidding" ("id" TEXT PRIMARY KEY, "number" TEXT NOT NULL, modality text NOT NULL, status text NOT NULL DEFAULT \'Em Elaboração\', "publicationDate" timestamp, "sessionDate" timestamp, "processId" text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL);');
    await f.database.exec(readFileSync(migrationPath, "utf8"));
    await f.connection.db.insert(biddings).values({ id: "bidding-1", number: "PE-2026-001", modality: "Pregão", processId: "proc" });

    await assert.rejects(
      f.connection.db.insert(biddings).values({ id: "bidding-2", number: "PE-2026-001", modality: "Pregão", processId: "proc" }),
      error => biddingNumberDuplicateError(error)?.error === BIDDING_NUMBER_DUPLICATE_ERROR,
    );
    assert.match(
      readFileSync("prisma/schema.prisma", "utf8"),
      /model Bidding \{[\s\S]*?\n\s+number\s+String\s+@unique/,
    );
  } finally {
    await f.close();
  }
});
