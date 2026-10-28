import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { constructionCases, constructionCatalogEntries, constructionReviews } from "../src/db/schema/construction-core";
import { constructionInspectionPlans } from "../src/db/schema/construction-lifecycle";
import { constructionDefinitionVersions } from "../src/db/schema/construction-viability";
import { processEvents } from "../src/db/schema/processes";
import { reviewConstructionProject } from "../src/lib/obras/construction-review";
import { setConstructionInspectionPlan } from "../src/lib/obras/construction-lifecycle";
import { createConstructionRequestsFixture } from "./helpers/construction-requests-fixture";
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
  const f = await createConstructionRequestsFixture();
  const db = f.db;
  const access = { administrator: false, employeeId: "analyst", departmentId: "sector", roles: ["ANALYST"] };
  const data = { ...approval, revision: 0, definitionVersion: 1, notes: "Deferimento técnico", checks: {}, documentIds: {}, fieldValues: {} };
  try {
    await db.update(constructionCases).set({ reviewStatus: "SUBMITTED", assignedEmployeeId: "analyst" }).where(eq(constructionCases.id, "case"));
    await db.insert(constructionCatalogEntries).values({ id: "final", kind: "INSPECTION_TYPE", name: "Vistoria final" });
    await db.insert(constructionDefinitionVersions).values({ kind: "PERMIT", version: 1, definition: { fields: [], checks: [], documents: [] }, publishedBy: "manager-user" });
    const save = () => f.transaction(tx => saveConstructionReviewWithInspectionPlan(data, ["final"], {
      review: () => reviewConstructionProject(tx, access, "manager-user", data),
      plan: input => setConstructionInspectionPlan(tx, access, "manager-user", input),
    }));
    await assert.rejects(save(), /checklist de vistoria/);
    assert.equal((await db.select().from(constructionCases).where(eq(constructionCases.id, "case")))[0].reviewStatus, "SUBMITTED");
    assert.equal((await db.select({ total: count() }).from(constructionReviews))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(constructionInspectionPlans))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(processEvents))[0].total, 0);
    await db.insert(constructionDefinitionVersions).values({ kind: "INSPECTION", version: 1, definition: { fields: [], checks: [], documents: [] }, publishedBy: "manager-user" });
    const reviewId = await save();
    assert.equal(await save(), reviewId);
    assert.equal((await db.select().from(constructionCases).where(eq(constructionCases.id, "case")))[0].reviewStatus, "APPROVED");
    assert.equal((await db.select({ total: count() }).from(constructionReviews))[0].total, 1);
    assert.equal((await db.select({ total: count() }).from(processEvents))[0].total, 2);
    const plans = await db.select().from(constructionInspectionPlans);
    assert.equal(plans.length, 1); assert.equal(plans[0].reviewId, reviewId);
    assert.deepEqual(plans[0].inspectionTypes, [{ id: "final", name: "Vistoria final", description: null }]);
  } finally { await f.close(); }
});
