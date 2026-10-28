import assert from "node:assert/strict";
import { test } from "node:test";
import { controlDatabaseErrorIncludes, createControlDrizzleFixture } from "../../../../tests/helpers/control-drizzle-fixture";
import { count, eq, inArray } from "drizzle-orm";
import { controlEvents, controlPlans } from "@/db/schema/internal-control";
import { requireControlEvent, requireControlFinding, requireControlPlan } from "@/db/repositories/internal-control/records";
import { createInternalControlFinding, createInternalControlPlan, resolveInternalControlFinding, transitionInternalControlPlan, recordInternalControlOpinion } from "../operations-service";

test("Controle Interno restringe criação, apontamento e resolução à UG do plano", async () => {
  const fixture = await createControlDrizzleFixture();
  try {
    const { db } = fixture;
    const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
    const other = { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] };
    const input = { title: "Plano de ensaio", reference: "POC P1", budgetUnitId: "ug" };
    const plan = await createInternalControlPlan(db, actor, input);
    assert.equal(plan.budgetUnitId, "ug");
    await assert.rejects(createInternalControlPlan(db, other, input), /unidades gestoras autorizadas/i);
    await assert.rejects(createInternalControlPlan(db, actor, { ...input, budgetUnitId: undefined }), /unidades gestoras autorizadas/i);
    await assert.rejects(createInternalControlPlan(db, { usuarioId: "ana" }, { ...input, budgetUnitId: "unbound-ug" }), /vinculada à entidade/i);
    const findingInput = { planId: plan.id, title: "Apontamento de ensaio", description: "Evidência de isolamento" };
    await assert.rejects(createInternalControlFinding(db, other, findingInput), /unidades gestoras autorizadas/i);
    const finding = await createInternalControlFinding(db, actor, findingInput);
    const opinionInput = { findingId: finding.id, opinion: "Irregularidade confirmada", correctiveAction: "Regularizar e comprovar a medida", recruitment: false };
    await assert.rejects(recordInternalControlOpinion(db, other, opinionInput), /unidades gestoras autorizadas/);
    await assert.rejects(recordInternalControlOpinion(db, actor, { ...opinionInput, recruitment: true }), /Identifique o servidor/);
    const opinion = await recordInternalControlOpinion(db, actor, opinionInput);
    assert.equal((await requireControlFinding(db.db, finding.id)).status, "EM_TRATAMENTO");
    await assert.rejects(resolveInternalControlFinding(db, other, finding.id, "Regularização conferida"), /unidades gestoras autorizadas/i);
    assert.equal((await requireControlFinding(db.db, finding.id)).status, "EM_TRATAMENTO");
    const decision = { planId: plan.id, status: "CONCLUIDO" as const, reason: "Todas as medidas foram conferidas" };
    await assert.rejects(transitionInternalControlPlan(db, actor, decision), /todos os apontamentos/);
    await assert.rejects(resolveInternalControlFinding(db, actor, finding.id, ""), /Justificativa/);
    assert.equal((await resolveInternalControlFinding(db, actor, finding.id, "Regularização conferida")).status, "RESOLVIDO");
    await assert.rejects(transitionInternalControlPlan(db, other, decision), /unidades gestoras autorizadas/);
    await fixture.pg.exec(`CREATE FUNCTION fail_control_decision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PLAN_COMPLETED' THEN RAISE EXCEPTION 'control rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_control_decision BEFORE INSERT ON "InternalControlEvent" FOR EACH ROW EXECUTE FUNCTION fail_control_decision();`);
    await assert.rejects(transitionInternalControlPlan(db, actor, decision), controlDatabaseErrorIncludes(/control rollback/));
    assert.equal((await requireControlPlan(db.db, plan.id)).status, "ABERTO");
    await fixture.pg.exec('DROP TRIGGER fail_control_decision ON "InternalControlEvent"; DROP FUNCTION fail_control_decision();');
    assert.equal((await transitionInternalControlPlan(db, actor, decision)).status, "CONCLUIDO");
    await assert.rejects(createInternalControlFinding(db, actor, findingInput), /plano de controle aberto/);
    assert.equal((await transitionInternalControlPlan(db, actor, { ...decision, status: "ABERTO", reason: "Revisão complementar fundamentada" })).status, "ABERTO");
    assert.equal((await db.db.select({ value: count() }).from(controlEvents).where(eq(controlEvents.planId, plan.id)))[0].value, 6);
    assert.deepEqual((await requireControlEvent(db.db, opinion.id)).snapshot, opinion.snapshot);
    await assert.rejects(recordInternalControlOpinion(db, actor, opinionInput), /apontamento pendente/);
    assert.equal((await db.db.select({ value: count() }).from(controlPlans).where(inArray(controlPlans.budgetUnitId, other.allowedBudgetUnitIds)))[0].value, 0);
  } finally { await fixture.close(); }
});
