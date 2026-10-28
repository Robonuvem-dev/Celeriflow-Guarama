import assert from "node:assert/strict";
import { test } from "node:test";
import { controlDatabaseErrorIncludes, createControlDrizzleFixture } from "../../../../tests/helpers/control-drizzle-fixture";
import { count, eq } from "drizzle-orm";
import { controlEvents } from "@/db/schema/internal-control";
import { userBudgetUnits } from "@/db/schema/identity";
import { createInternalControlPlan, createInternalControlFinding, resolveInternalControlFinding, transitionInternalControlPlan } from "../operations-service";
import { sendControlNotice, respondControlNotice, reviewControlNoticeResponse } from "../control-notifications";
import { scheduleControlObligation, completeControlObligation, runControlAgendaAlerts, readControlAgenda } from "../control-agenda";
import { buildControlReport, renderControlReport } from "../control-report";

const owner = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
const recipient = { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug"] };

test("notificação isola destinatário, conserva resposta, exige análise e inclui impressão dos fatos", async () => {
  const f = await createControlDrizzleFixture();
  try {
    await f.db.db.insert(userBudgetUnits).values([{ usuarioId: "ana", budgetUnitId: "ug" }, { usuarioId: "beatriz", budgetUnitId: "ug" }]);
    const plan = await createInternalControlPlan(f.db, owner, { title: "Revisão financeira", reference: "Procedimento municipal ajustável", budgetUnitId: "ug" });
    const finding = await createInternalControlFinding(f.db, owner, { planId: plan.id, title: "Documento pendente", description: "Solicitar esclarecimento" });
    const input = { planId: plan.id, findingId: finding.id, recipientId: "beatriz", title: "Esclarecimento", message: "Apresente a comprovação", dueAt: new Date("2099-10-20T12:00:00Z"), documentIds: [], idempotencyKey: "solicitacao-1" };
    const notice = await sendControlNotice(f.db, owner, input);
    assert.equal((await sendControlNotice(f.db, owner, input)).id, notice.id);
    await assert.rejects(sendControlNotice(f.db, owner, { ...input, message: "Outra mensagem" }), /Chave/);
    await assert.rejects(respondControlNotice(f.db, owner, { noticeId: notice.id, response: "Resposta alheia", documentIds: [] }), /destinatário/);
    await assert.rejects(resolveInternalControlFinding(f.db, owner, finding.id, "Conclusão prematura"), /notificações pendentes/);
    const response = await respondControlNotice(f.db, recipient, { noticeId: notice.id, response: "Comprovação apresentada", documentIds: [] });
    assert.equal((await respondControlNotice(f.db, recipient, { noticeId: notice.id, response: "Comprovação apresentada", documentIds: [] })).id, response.id);
    await assert.rejects(respondControlNotice(f.db, recipient, { noticeId: notice.id, response: "Sobrescrever", documentIds: [] }), /já registrada/);
    await assert.rejects(reviewControlNoticeResponse(f.db, recipient, { noticeId: notice.id, accepted: true, reason: "Autoanálise" }), /controlador|própria/);
    await reviewControlNoticeResponse(f.db, owner, { noticeId: notice.id, accepted: true, reason: "Documento conferido" });
    await resolveInternalControlFinding(f.db, owner, finding.id, "Regularização comprovada");
    const report = await buildControlReport(f.db, recipient, { planId: plan.id, noticeId: notice.id });
    assert.ok(report.rows.some(row => row.join(" ").includes("Comprovação apresentada")));
    const pdf = await renderControlReport(report, "PDF");
    assert.equal(pdf.bytes.subarray(0, 4).toString(), "%PDF");
    await assert.rejects(buildControlReport(f.db, { ...recipient, allowedBudgetUnitIds: ["ug-restrita"] }, { planId: plan.id, noticeId: notice.id }), /autorizadas/);
    await transitionInternalControlPlan(f.db, owner, { planId: plan.id, status: "CONCLUIDO", reason: "Ciclo conferido" });
  } finally { await f.close(); }
});

test("falha ao registrar resposta preserva notificação sem retorno aparente", async () => {
  const f = await createControlDrizzleFixture();
  try {
    await f.db.db.insert(userBudgetUnits).values({ usuarioId: "beatriz", budgetUnitId: "ug" });
    const plan = await createInternalControlPlan(f.db, owner, { title: "Controle documental", reference: "Procedimento ajustável", budgetUnitId: "ug" });
    const notice = await sendControlNotice(f.db, owner, { planId: plan.id, recipientId: "beatriz", title: "Solicitação", message: "Responder", dueAt: new Date("2099-10-20T12:00:00Z"), documentIds: [], idempotencyKey: "N1" });
    await f.pg.exec(`CREATE FUNCTION reject_control_response() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CONTROL_NOTICE_RESPONDED' THEN RAISE EXCEPTION 'response rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_control_response BEFORE INSERT ON "InternalControlEvent" FOR EACH ROW EXECUTE FUNCTION reject_control_response();`);
    await assert.rejects(respondControlNotice(f.db, recipient, { noticeId: notice.id, response: "Resposta", documentIds: [] }), controlDatabaseErrorIncludes(/response rollback/));
    assert.equal((await f.db.db.select({ value: count() }).from(controlEvents).where(eq(controlEvents.eventType, "CONTROL_NOTICE_RESPONDED")))[0].value, 0);
    assert.equal((await f.db.db.select({ value: count() }).from(controlEvents).where(eq(controlEvents.id, notice.id)))[0].value, 1);
  } finally { await f.close(); }
});

test("agenda segrega visualização e baixa, deduplica alertas a vencer/expirados e exige justificativa", async t => {
  const f = await createControlDrizzleFixture();
  try {
    await f.db.db.insert(userBudgetUnits).values([{ usuarioId: "ana", budgetUnitId: "ug" }, { usuarioId: "beatriz", budgetUnitId: "ug" }]);
    const plan = await createInternalControlPlan(f.db, owner, { title: "Obrigações mensais", reference: "Agenda municipal", budgetUnitId: "ug" });
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T12:00:00Z") });
    const input = { planId: plan.id, title: "Prestação mensal", description: "Conferir e apresentar", dueAt: new Date("2026-10-03T12:00:00Z"), criticality: "ALTA" as const, alertDays: 3, expirationDays: 0, viewerIds: ["ana"], closerIds: ["beatriz"], idempotencyKey: "agenda-1" };
    const obligation = await scheduleControlObligation(f.db, owner, input);
    assert.equal((await scheduleControlObligation(f.db, owner, input)).id, obligation.id);
    assert.equal((await readControlAgenda(f.db.db, recipient)).length, 1);
    assert.equal((await readControlAgenda(f.db.db, { ...recipient, allowedBudgetUnitIds: ["ug-restrita"] })).length, 0);
    await assert.rejects(completeControlObligation(f.db, owner, { obligationId: obligation.id, reason: "Visualizador não baixa" }), /designados/);
    await assert.rejects(completeControlObligation(f.db, recipient, { obligationId: obligation.id, reason: "" }), /justificativa/);
    assert.equal((await runControlAgendaAlerts(f.db, owner, plan.id)).length, 2);
    assert.equal((await runControlAgendaAlerts(f.db, owner, plan.id)).length, 0);
    t.mock.timers.setTime(new Date("2026-10-04T12:00:00Z").getTime());
    assert.equal((await runControlAgendaAlerts(f.db, owner, plan.id)).length, 2);
    await assert.rejects(transitionInternalControlPlan(f.db, owner, { planId: plan.id, status: "CONCLUIDO", reason: "Ainda pendente" }), /obrigações pendentes/);
    await completeControlObligation(f.db, recipient, { obligationId: obligation.id, reason: "Apresentação justificada e conferida" });
    assert.equal((await runControlAgendaAlerts(f.db, owner, plan.id)).length, 0);
    assert.ok((await readControlAgenda(f.db.db, recipient))[0].completion);
    await transitionInternalControlPlan(f.db, owner, { planId: plan.id, status: "CONCLUIDO", reason: "Obrigações atendidas" });
  } finally { t.mock.timers.reset(); await f.close(); }
});
