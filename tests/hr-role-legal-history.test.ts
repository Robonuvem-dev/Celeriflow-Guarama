import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { recordRoleLegalHistory } from "../src/lib/rh/role-legal-history";
import { readControlWorkforceStatistics, controlWorkforceStatisticsReport } from "../src/lib/c7/workforce-statistics";

test("P6: cargos têm posição legal temporal por ente, extinção comprovada e retificação aditiva", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture();
  let drizzle: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    drizzle = await connectFinanceDrizzleFixture(f.pg);
    drizzle.connection.pool.options.max = 1; // PGlite, like the existing Prisma fixture, has one backend.
    await f.pg.exec('DROP TABLE "HrRoleLegalHistory";');
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261014120000_hr_role_legal_history/migration.sql", "utf8"));
    await f.db.role.create({ data: { id: "legal-role", name: "Denominação cadastral atual", isActive: false } });
    await f.db.role.create({ data: { id: "undocumented-role", name: "Cargo sem ato", isActive: false } });
    await f.db.document.create({ data: { id: "legal-act-doc", title: "Ato municipal documentado", documentType: "Ato", fileUrl: "/documento-legal", status: "Válido" } });
    await f.db.documentVersion.create({ data: { id: "legal-act-doc-v1", documentId: "legal-act-doc", versionNumber: 1, fileUrl: "/documento-legal", hashSha256: "a".repeat(64), status: "FINAL" } });
    await f.db.legalText.create({ data: { id: "legal-act", type: "ATO", number: "fixture", summary: "Ato da fixture isolada", governmentLevel: "MUNICIPAL", issuingBody: "Ente da fixture", governmentEntityId: "ente" } });
    await f.db.legalTextVersion.create({ data: { id: "legal-act-v1", legalTextId: "legal-act", versionNumber: 1, content: "Posição legal documentada", documentId: "legal-act-doc" } });
    const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
    const base = { financialYearId: "ano", roleId: "legal-role", effectiveFrom: "2020-01-01", expectedVersion: 0, state: "EXISTING" as const, designation: "Denominação original", authorizedSeats: 2, legalReference: "Ato municipal vinculado", legalTextVersionId: "legal-act-v1", documentVersionId: "legal-act-doc-v1", reason: "Posição inicial documentada", idempotencyKey: "legal-create" };
    const created = await Promise.all([recordRoleLegalHistory(drizzle.connection, actor, base), recordRoleLegalHistory(drizzle.connection, actor, base)]);
    assert.equal(created[0].id, created[1].id);
    await assert.rejects(recordRoleLegalHistory(drizzle.connection, { ...actor, allowedBudgetUnitIds: [] }, base), /autorizadas/);
    await assert.rejects(recordRoleLegalHistory(drizzle.connection, actor, { ...base, reason: "Fundamento diferente" }), /outros dados/);
    const extinct = await recordRoleLegalHistory(drizzle.connection, actor, { ...base, effectiveFrom: "2026-07-01", expectedVersion: 1, state: "EXTINGUISHED", authorizedSeats: 0, reason: "Extinção documentada pelo ato", idempotencyKey: "legal-extinct" });
    assert.equal(extinct.previousEventId, created[0].id);
    const before = await readControlWorkforceStatistics(drizzle.connection, actor, { financialYearId: "ano", referenceDate: "2026-06-30", legalStatus: "EXISTING" });
    assert.equal(before.groups.length, 1);
    assert.equal(before.groups[0].historicalDesignation, "Denominação original");
    assert.equal(before.groups[0].currentlyActive, false);
    const after = await readControlWorkforceStatistics(drizzle.connection, actor, { financialYearId: "ano", referenceDate: "2026-07-01", legalStatus: "EXTINGUISHED" });
    assert.equal(after.groups.length, 1);
    assert.equal(after.groups[0].legalEventId, extinct.id);
    assert.equal(after.groups[0].legalDocumentHash, "a".repeat(64));
    const missing = await readControlWorkforceStatistics(drizzle.connection, actor, { financialYearId: "ano", referenceDate: "2026-07-01", roleId: "undocumented-role", legalStatus: "NOT_DOCUMENTED" });
    assert.equal(missing.groups[0].legalState, "NOT_DOCUMENTED");
    const corrected = await recordRoleLegalHistory(drizzle.connection, actor, { ...base, effectiveFrom: "2026-07-01", expectedVersion: 2, state: "EXTINGUISHED", authorizedSeats: 0, designation: "Denominação extinta retificada", reason: "Retificação editorial do ato documentado", rectification: true, idempotencyKey: "legal-rectify" });
    assert.equal(corrected.previousEventId, extinct.id);
    const final = await readControlWorkforceStatistics(drizzle.connection, actor, { financialYearId: "ano", referenceDate: "2026-07-01", legalStatus: "EXTINGUISHED" });
    assert.equal(final.groups[0].legalEventId, corrected.id);
    assert.ok(controlWorkforceStatisticsReport(final).rows.every(row => row.length === 25));
    await assert.rejects(recordRoleLegalHistory(drizzle.connection, actor, { ...base, effectiveFrom: "2026-07-02", expectedVersion: 1, idempotencyKey: "stale-legal" }), /última versão/);
    await assert.rejects(f.pg.query('UPDATE "HrRoleLegalHistory" SET designation=$1 WHERE id=$2', ["Sobrescrita", extinct.id]), /imutável/);
    await assert.rejects(f.pg.query('DELETE FROM "HrRoleLegalHistory" WHERE id=$1', [extinct.id]), /imutável/);
  } finally {
    try { await drizzle?.close(); }
    finally {
      try { await f.close(); }
      finally { if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode; }
    }
  }
});
