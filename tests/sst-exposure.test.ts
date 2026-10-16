import assert from "node:assert/strict";
import test from "node:test";
import { exposureGroupInput, exposureMemberWhere } from "../src/lib/sst/exposure-policy";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

test("exposure criteria combine location and canonical role/function without individual membership", () => {
  assert.deepEqual(exposureMemberWhere({ departmentIds: ["workplace"], roleIds: ["role"] }, "secretariat"), { secretariatId: "secretariat", isActive: true, departmentId: { in: ["workplace"] }, roleId: { in: ["role"] } });
  assert.deepEqual(exposureMemberWhere({ departmentIds: [], roleIds: [] }, "secretariat"), { secretariatId: "secretariat", isActive: true });
  assert.equal(exposureGroupInput.safeParse({ budgetUnitId: "ug", code: "GHE1", name: "Grupo", startsAt: "2026-10-10", endsAt: "2026-09-10" }).success, false);
});
test("GHE codes are unique inside a unit and group vigency cannot be reversed", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); INSERT INTO "BudgetUnit" VALUES ('ug1'),('ug2');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010170000_add_sst_exposure_groups/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "SstExposureGroup" (id,"budgetUnitId",code,name,"startsAt","createdById","updatedAt") VALUES ('g1','ug1','GHE1','Grupo','2026-10-10','u',now()),('g2','ug2','GHE1','Grupo','2026-10-10','u',now());`);
    await assert.rejects(db.exec(`INSERT INTO "SstExposureGroup" (id,"budgetUnitId",code,name,"startsAt","createdById","updatedAt") VALUES ('g3','ug1','GHE1','Grupo','2026-10-10','u',now())`), /unique constraint/);
    await assert.rejects(db.exec(`UPDATE "SstExposureGroup" SET "endsAt"='2026-09-10' WHERE id='g1'`), /check constraint/);
  } finally { await db.close(); }
});
