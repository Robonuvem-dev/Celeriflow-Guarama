import assert from "node:assert/strict";
import test from "node:test";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createControlDiagnosticsFixture } from "../../../../tests/helpers/control-diagnostics-fixture";
import { controlDatabaseErrorIncludes } from "../../../../tests/helpers/control-drizzle-fixture";
import { controlEvents, controlFindings } from "@/db/schema/internal-control";
import { createInternalControlPlan } from "../operations-service";
import { runMunicipalControlDiagnostics } from "../municipal-diagnostics";

const memorySchema = z.object({
  requestHash: z.string(), findingIds: z.array(z.string()),
  rows: z.array(z.object({ family: z.string(), subjectId: z.string(), status: z.string(), findingId: z.string().optional(), evidence: z.record(z.string(), z.unknown()) })),
});

test("diagnóstico C7: quatro famílias, Decimal, escopo completo, replay, deduplicação e rollback atômico", async () => {
  const f = await createControlDiagnosticsFixture();
  try {
    const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-restrita"], sourcePermissions: { financial: true, procurement: true, tax: true } };
    const plan = await createInternalControlPlan(f.db, actor, { title: "Diagnóstico municipal", reference: "Exercício 2026", budgetUnitId: "ug" });
    const input = { planId: plan.id, financialYearId: "ano", fiscalThrough: new Date("2026-09-30T23:59:59.999Z"), idempotencyKey: "diagnostic-1" };
    await assert.rejects(runMunicipalControlDiagnostics(f.db, { ...actor, allowedBudgetUnitIds: ["ug"] }, input), /UGs completas/);
    await assert.rejects(runMunicipalControlDiagnostics(f.db, { ...actor, usuarioId: "beatriz" }, input), /controlador/);
    const first = await runMunicipalControlDiagnostics(f.db, actor, input);
    const memory = memorySchema.parse(first.snapshot);
    assert.equal(new Set(memory.rows.map(row => row.family)).size, 4);
    assert.equal(memory.rows.length, 5);
    assert.equal(memory.findingIds.length, 3);
    assert.equal(memory.rows.find(row => row.family === "SUPPLIER_DEBT")?.evidence.total, "90.00");
    assert.equal(memory.rows.find(row => row.family === "CONTRACT_LIMIT")?.evidence.committed, "100.25");
    assert.equal(memory.rows.find(row => row.family === "NEGATIVE_SOURCE")?.evidence.balance, "-0.30");
    assert.ok(memory.rows.filter(row => row.family === "CONSTITUTIONAL_MINIMUM").every(row => row.status === "NOT_EVALUATED"));
    assert.equal((await runMunicipalControlDiagnostics(f.db, actor, input)).id, first.id);
    await assert.rejects(runMunicipalControlDiagnostics(f.db, actor, { ...input, fiscalThrough: new Date("2026-08-31T23:59:59.999Z") }), /Chave do diagnóstico/);
    const second = memorySchema.parse((await runMunicipalControlDiagnostics(f.db, actor, { ...input, idempotencyKey: "diagnostic-2" })).snapshot);
    assert.deepEqual(second.findingIds, memory.findingIds);
    const countFindings = async () => (await f.db.db.select({ value: count() }).from(controlFindings).where(eq(controlFindings.planId, plan.id)))[0].value;
    const countEvents = async () => (await f.db.db.select({ value: count() }).from(controlEvents).where(eq(controlEvents.planId, plan.id)))[0].value;
    const before = { findings: await countFindings(), events: await countEvents() };
    await f.db.db.execute(sql`UPDATE "TaxAssessment" SET "finalValueDecimal"=130.30 WHERE id='assessment'`);
    await f.pg.exec(`CREATE FUNCTION fail_municipal_diagnostic() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='MUNICIPAL_DIAGNOSTICS_EXECUTED' THEN RAISE EXCEPTION 'diagnostic rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_municipal_diagnostic BEFORE INSERT ON "InternalControlEvent" FOR EACH ROW EXECUTE FUNCTION fail_municipal_diagnostic();`);
    await assert.rejects(runMunicipalControlDiagnostics(f.db, actor, { ...input, idempotencyKey: "must-rollback" }), controlDatabaseErrorIncludes(/diagnostic rollback/));
    assert.deepEqual({ findings: await countFindings(), events: await countEvents() }, before);
    await f.pg.exec('DROP TRIGGER fail_municipal_diagnostic ON "InternalControlEvent"; DROP FUNCTION fail_municipal_diagnostic();');
    const denied = await runMunicipalControlDiagnostics(f.db, { ...actor, sourcePermissions: { financial: false, procurement: false, tax: false } }, { ...input, idempotencyKey: "no-source-access" });
    assert.ok(memorySchema.parse(denied.snapshot).rows.every(row => row.status === "NOT_EVALUATED"));
    assert.equal(await countFindings(), before.findings);
  } finally { await f.close(); }
});
