import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { saveConstructionReviewWithInspectionPlan } from "../src/lib/obras/construction-lifecycle-review";

const approval = { caseId: "case", requestKey: randomUUID(), reviewType: "PROJECT", decision: "APPROVED" };

test("project approval requires a nonempty, unique inspection selection before writing", async () => {
  let writes = 0;
  const writers = { review: async () => { writes++; return "review"; }, plan: async () => { writes++; return "plan"; } };
  await assert.rejects(saveConstructionReviewWithInspectionPlan(approval, undefined, writers));
  await assert.rejects(saveConstructionReviewWithInspectionPlan(approval, [], writers));
  await assert.rejects(saveConstructionReviewWithInspectionPlan(approval, ["final", "final"], writers), /repetidos/);
  assert.equal(writes, 0);
});

test("preanalysis approval, correction and denial never create a lifecycle plan", async () => {
  for (const data of [{ ...approval, reviewType: "PREANALYSIS" }, { ...approval, decision: "CORRECTION_REQUIRED" }, { ...approval, decision: "DENIED" }]) {
    let plans = 0;
    assert.equal(await saveConstructionReviewWithInspectionPlan(data, undefined, { review: async () => "review", plan: async () => { plans++; return "plan"; } }), "review");
    assert.equal(plans, 0);
  }
});

test("PostgreSQL: atomic review/plan persistence rolls back approval and events on plan failure, retries reuse both records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "ConstructionCase" ("id" TEXT PRIMARY KEY, "reviewStatus" TEXT NOT NULL DEFAULT 'SUBMITTED');
      CREATE TABLE "ConstructionReview" ("id" TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id"), "requestKey" TEXT NOT NULL UNIQUE);
      CREATE TABLE "ConstructionCatalogEntry" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Document" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Process" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "ProcessEvent" ("id" TEXT PRIMARY KEY, "reviewId" TEXT NOT NULL REFERENCES "ConstructionReview"("id"));
    `);
    await db.exec(await readFile(new URL("../prisma/migrations-ibema/20261010240000_construction_lifecycle/migration.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO "ConstructionCase" ("id") VALUES ('case')`);

    // Exercise the same orchestration used inside registerConstructionReview's transaction.
    // These writers persist real records/constraints through the caller's PostgreSQL transaction.
    const save = (failPlan: boolean) => db.transaction(async (tx) => saveConstructionReviewWithInspectionPlan(approval, ["final"], {
      review: async () => {
        const old = await tx.query<{ id: string }>('SELECT "id" FROM "ConstructionReview" WHERE "requestKey"=$1', [approval.requestKey]);
        if (old.rows.length) return old.rows[0].id;
        const id = randomUUID();
        await tx.query('INSERT INTO "ConstructionReview" ("id","caseId","requestKey") VALUES ($1,$2,$3)', [id, approval.caseId, approval.requestKey]);
        await tx.query('UPDATE "ConstructionCase" SET "reviewStatus"=\'APPROVED\' WHERE "id"=$1', [approval.caseId]);
        await tx.query('INSERT INTO "ProcessEvent" ("id","reviewId") VALUES ($1,$2)', [randomUUID(), id]);
        return id;
      },
      plan: async (input) => {
        assert.equal(input.requestKey, approval.requestKey);
        assert.equal(input.caseId, approval.caseId);
        assert.deepEqual(input.inspectionTypeIds, ["final"]);
        const old = await tx.query<{ id: string }>('SELECT "id" FROM "ConstructionInspectionPlan" WHERE "requestKey"=$1', [input.requestKey]);
        if (old.rows.length) return old.rows[0].id;
        const id = randomUUID();
        await tx.query('INSERT INTO "ConstructionInspectionPlan" ("id","caseId","requestKey","reviewId","inspectionTypes","definitionSnapshot","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, input.caseId, input.requestKey, failPlan ? "missing-review" : input.reviewId, JSON.stringify(input.inspectionTypeIds), JSON.stringify({ version: 1 }), "actor"]);
        return id;
      },
    }));

    await assert.rejects(save(true), /foreign key/);
    assert.equal((await db.query<{ reviewStatus: string }>('SELECT "reviewStatus" FROM "ConstructionCase"')).rows[0].reviewStatus, "SUBMITTED");
    for (const table of ["ConstructionReview", "ConstructionInspectionPlan", "ProcessEvent"]) {
      assert.equal((await db.query(`SELECT * FROM "${table}"`)).rows.length, 0, `${table} must roll back`);
    }
    const reviewId = await save(false);
    assert.equal(await save(false), reviewId);
    assert.equal((await db.query<{ reviewStatus: string }>('SELECT "reviewStatus" FROM "ConstructionCase"')).rows[0].reviewStatus, "APPROVED");
    for (const table of ["ConstructionReview", "ConstructionInspectionPlan", "ProcessEvent"]) {
      assert.equal((await db.query(`SELECT * FROM "${table}"`)).rows.length, 1, `${table} must not duplicate on retry`);
    }
    const plan = await db.query<{ reviewId: string; inspectionTypes: string[] }>('SELECT "reviewId", "inspectionTypes" FROM "ConstructionInspectionPlan"');
    assert.equal(plan.rows[0].reviewId, reviewId);
    assert.deepEqual(plan.rows[0].inspectionTypes, ["final"]);
  } finally { await db.close(); }
});
