import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { insertLead } from "../src/db/repositories/platform/leads";
import { leads } from "../src/db/schema/leads";

test("lead writes retain the historical response DTO, nullable fields and caller rollback", { timeout: 60_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  try {
    const baseline = readFileSync(new URL("../prisma/migrations-ibema/20261009232000_baseline/migration.sql", import.meta.url), "utf8");
    const table = baseline.match(/CREATE TABLE "Lead" \([\s\S]*?\n\);/)?.[0];
    assert.ok(table);
    await fixture.database.exec(table);
    const input = { name: "Ana D'Ávila", organization: "Prefeitura Municipal", city: "Aurora das Veredas", state: "MG", email: "lead@example.invalid", consent: true };
    await t.test("omitted values remain SQL NULL and the returned row is complete", async () => {
      const lead = await insertLead(db, input);
      assert.match(lead.id, /^c[a-z0-9]{24}$/);
      assert.ok(lead.createdAt instanceof Date);
      assert.ok(lead.updatedAt instanceof Date);
      const { id, createdAt, updatedAt, ...data } = lead;
      assert.ok(id); assert.ok(createdAt); assert.ok(updatedAt);
      assert.deepEqual(data, { ...input, role: null, phone: null, moduleInterest: null, message: null });
      assert.deepEqual(await db.select().from(leads), [lead]);
    });
    await t.test("free text stays a value and an aborted owner transaction leaves no row", async () => {
      const abort = new Error("owner transaction rollback");
      await assert.rejects(db.transaction(async tx => {
        const lead = await insertLead(tx, { ...input, role: "", phone: "", moduleInterest: "Tributação", message: "'); DROP TABLE \"Lead\"; --" });
        assert.equal(lead.role, "");
        assert.equal(lead.phone, "");
        assert.equal(lead.message, "'); DROP TABLE \"Lead\"; --");
        throw abort;
      }), error => error === abort);
      assert.equal((await db.select().from(leads)).length, 1);
    });
  } finally { await fixture.close(); }
});
