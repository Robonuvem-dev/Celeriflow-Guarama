import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import type { PermissionUser } from "@/lib/contracts/identity";
import { families } from "@/db/schema/master-data";
import { healthFamilies } from "@/db/schema/health-territory";
import { saveFamily, TerritoryError } from "@/lib/saude/territory-service";
import { createLocalDrizzleDatabase } from "../../../../tests/helpers/local-drizzle-database";

async function fixture(candidate: { id: string; responsiblePersonId: string | null; healthProfile: { id: string } | null } | null) {
  const local = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.equal(migrations.length, 156);
    for (const name of migrations) await local.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    await local.database.exec(`INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('responsible','Responsável da família',CURRENT_TIMESTAMP),('other-person','Outro responsável',CURRENT_TIMESTAMP);`);
    const database = local.connection.db;
    if (candidate) {
      await database.insert(families).values({ id: candidate.id, code: "FAM-001", responsiblePersonId: candidate.responsiblePersonId });
      if (candidate.healthProfile) await database.insert(healthFamilies).values({ id: candidate.healthProfile.id, familyCode: "FAM-001", masterFamilyId: candidate.id, responsiblePersonId: candidate.responsiblePersonId });
    } else {
      // A genuine social family with the same responsible person must remain
      // separate when the caller did not supply an explicit canonical code.
      await database.insert(families).values({ id: "social-match", code: "SOCIAL-ORIGINAL", responsiblePersonId: "responsible" });
    }
    const user: PermissionUser = { id: "family-test", firebaseUid: "fixture-not-authenticated", email: "family@example.invalid", name: "Ensaio familiar", role: "Saúde", profileCode: "SYSTEM_ADMINISTRATOR", permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null };
    const context = { user, database, databaseConnection: local.connection };
    async function snapshot() {
      return Promise.all(["Family", "FamilyMember", "HealthFamily"].map(async table => {
        const result = await database.execute<{ data: unknown }>(sql`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) AS data FROM ${sql.identifier(table)} t`);
        return { table, data: result.rows[0].data };
      }));
    }
    return { context, database, snapshot, close: local.close };
  } catch (error) { await local.close(); throw error; }
}

test("health rejects an explicit family code owned by another responsible person before writing", async () => {
  const f = await fixture({ id: "existing", responsiblePersonId: "other-person", healthProfile: null });
  try {
    const before = await f.snapshot();
    await assert.rejects(() => saveFamily(f.context, { familyCode: "FAM-001", responsiblePersonId: "responsible" }), TerritoryError);
    assert.deepEqual(await f.snapshot(), before);
  } finally { await f.close(); }
});

test("health rejects a family code already assigned to a health profile", async () => {
  const f = await fixture({ id: "existing", responsiblePersonId: "responsible", healthProfile: { id: "other-health" } });
  try {
    const before = await f.snapshot();
    await assert.rejects(() => saveFamily(f.context, { familyCode: "FAM-001", responsiblePersonId: "responsible" }), TerritoryError);
    assert.deepEqual(await f.snapshot(), before);
  } finally { await f.close(); }
});

test("health reuses an explicit canonical code and preserves its responsible person when omitted", async () => {
  const f = await fixture({ id: "existing", responsiblePersonId: "responsible", healthProfile: null });
  try {
    const created = await saveFamily(f.context, { familyCode: "FAM-001" });
    const [health] = await f.database.select().from(healthFamilies).where(eq(healthFamilies.id, created.id));
    assert.equal(health.masterFamilyId, "existing");
    assert.equal(health.responsiblePersonId, "responsible");
    assert.equal((await f.database.select().from(families)).length, 1);
  } finally { await f.close(); }
});

test("health creates a canonical family without guessing a social match from its responsible person", async () => {
  const f = await fixture(null);
  try {
    const [socialBefore] = await f.database.select().from(families).where(eq(families.id, "social-match"));
    const created = await saveFamily(f.context, { responsiblePersonId: "responsible" });
    const [health] = await f.database.select().from(healthFamilies).where(eq(healthFamilies.id, created.id));
    assert.ok(health.masterFamilyId);
    assert.notEqual(health.masterFamilyId, "social-match");
    const [master] = await f.database.select().from(families).where(eq(families.id, health.masterFamilyId));
    assert.equal(health.masterFamilyId, master.id);
    assert.equal(master.responsiblePersonId, "responsible");
    assert.deepEqual((await f.database.select().from(families).where(eq(families.id, "social-match")))[0], socialBefore);
  } finally { await f.close(); }
});
