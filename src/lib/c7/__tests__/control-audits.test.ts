import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlanningAccountingFixture } from "../../../../tests/helpers/planning-accounting-fixture";
import { createInternalControlPlan, resolveInternalControlFinding, transitionInternalControlPlan } from "../operations-service";
import { publishControlChecklist } from "../control-checklists";
import { scheduleControlAudit, sendControlAudit, respondControlAudit, reviewControlAudit, transitionControlAudit, readControlAudit } from "../control-audits";
import { buildControlReport } from "../control-report";

const owner = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
const recipient = { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug"] };

test("auditoria preserva questionário, impede autoanálise, devolve resposta e exige tratamento do achado", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.db.usuarioUnidadeGestora.createMany({ data: [{ usuarioId: "ana", budgetUnitId: "ug" }, { usuarioId: "beatriz", budgetUnitId: "ug" }] });
    const unit = await f.db.budgetUnit.findUniqueOrThrow({ where: { id: "ug" } });
    await f.db.costCenter.create({ data: { id: "audit-center", code: "AUDIT", name: "Centro municipal", governmentEntityId: "ente", secretariatId: unit.secretariatId } });
    const plan = await createInternalControlPlan(f.db, owner, { title: "Auditoria documental", reference: "Procedimento municipal ajustável", budgetUnitId: "ug" });
    const edition = await publishControlChecklist(f.db, owner, { planId: plan.id, title: "Conferência documental", category: "DOCUMENTOS", groups: [{ name: "Documentos", responses: ["Sim", "Não"], irregularResponse: "Não", items: [{ number: 1, question: "Existe documento comprobatório?" }] }] });
    const input = { planId: plan.id, checklistId: edition.id, selectedNumbers: [1], title: "Auditoria mensal", description: "Conferir documentos", startAt: new Date("2026-10-01"), endAt: new Date("2026-10-10"), responseDueAt: new Date("2099-10-20"), auditorId: "ana", recipientId: "beatriz", costCenterId: "audit-center", documentIds: [], idempotencyKey: "audit-schedule" };
    const audit = await scheduleControlAudit(f.db, owner, input);
    await assert.rejects(f.db.internalControlEvent.update({ where: { id: audit.id }, data: { reason: "Reescrever agendamento" } }), /aditivos/);
    assert.equal((await scheduleControlAudit(f.db, owner, input)).id, audit.id);
    await assert.rejects(scheduleControlAudit(f.db, owner, { ...input, title: "Outra auditoria" }), /Chave/);
    await assert.rejects(transitionInternalControlPlan(f.db, owner, { planId: plan.id, status: "CONCLUIDO", reason: "Prematuro" }), /auditorias pendentes/);
    const sending = { auditId: audit.id, reason: "Questionário destinado ao responsável", idempotencyKey: "audit-send" };
    await sendControlAudit(f.db, owner, sending);
    assert.equal((await sendControlAudit(f.db, owner, sending)).eventType, "AUDIT_SENT");
    await assert.rejects(respondControlAudit(f.db, owner, { auditId: audit.id, answers: [], documentIds: [], idempotencyKey: "wrong-actor" }), /destinatário/);
    const answering = { auditId: audit.id, answers: [{ number: 1, response: "Não", reason: "Documento não localizado" }], documentIds: [], idempotencyKey: "audit-answer-1" };
    const first = await respondControlAudit(f.db, recipient, answering);
    assert.equal((await respondControlAudit(f.db, recipient, answering)).id, first.id);
    await assert.rejects(reviewControlAudit(f.db, recipient, { auditId: audit.id, accepted: false, analyses: [], reason: "Autoanálise", documentIds: [], idempotencyKey: "wrong-review" }), /independente/);
    await reviewControlAudit(f.db, owner, { auditId: audit.id, accepted: false, analyses: [], reason: "Complemente a diligência", documentIds: [], idempotencyKey: "review-return" });
    await respondControlAudit(f.db, recipient, { ...answering, answers: [{ number: 1, response: "Não", reason: "Diligência concluída sem localizar o documento" }], idempotencyKey: "audit-answer-2" });
    const reviewing = { auditId: audit.id, accepted: true, analyses: [{ number: 1, conclusion: "IRREGULAR" as const, reason: "Ausência confirmada", correctiveAction: "Apresentar documento substitutivo válido" }], reason: "Diligência analisada", documentIds: [], idempotencyKey: "review-accept" };
    await reviewControlAudit(f.db, owner, reviewing);
    await reviewControlAudit(f.db, owner, reviewing);
    assert.equal(await f.db.internalControlFinding.count({ where: { planId: plan.id } }), 1);
    const closing = { auditId: audit.id, decision: "CLOSE" as const, reason: "Regularização conferida", idempotencyKey: "audit-close" };
    await assert.rejects(transitionControlAudit(f.db, owner, closing), /apontamentos/);
    const finding = await f.db.internalControlFinding.findFirstOrThrow({ where: { planId: plan.id } });
    await resolveInternalControlFinding(f.db, owner, finding.id, "Documento substitutivo apresentado e validado");
    await transitionControlAudit(f.db, owner, closing);
    await transitionInternalControlPlan(f.db, owner, { planId: plan.id, status: "CONCLUIDO", reason: "Ciclo integral concluído" });
    assert.equal(await f.db.internalControlEvent.count({ where: { planId: plan.id, eventType: "AUDIT_RESPONSE" } }), 2);
    const report = await buildControlReport(f.db, recipient, { planId: plan.id, auditId: audit.id });
    assert.ok(report.rows.some(row => row.join(" ").includes("Documento não localizado")));
    await assert.rejects(buildControlReport(f.db, { usuarioId: "outro", allowedBudgetUnitIds: ["ug"] }, { planId: plan.id, auditId: audit.id }), /indisponível/);
    assert.equal(readControlAudit(audit.snapshot)?.groups[0].items[0].question, "Existe documento comprobatório?");
  } finally { await f.close(); }
});

test("falha na análise reverte achados e duplicação não leva respostas", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.db.usuarioUnidadeGestora.createMany({ data: [{ usuarioId: "ana", budgetUnitId: "ug" }, { usuarioId: "beatriz", budgetUnitId: "ug" }] });
    const unit = await f.db.budgetUnit.findUniqueOrThrow({ where: { id: "ug" } });
    await f.db.costCenter.create({ data: { id: "audit-center", code: "AUDIT", name: "Centro", governmentEntityId: "ente", secretariatId: unit.secretariatId } });
    const plan = await createInternalControlPlan(f.db, owner, { title: "Ciclo", reference: "Procedimento ajustável", budgetUnitId: "ug" });
    const edition = await publishControlChecklist(f.db, owner, { planId: plan.id, title: "Itens", category: "DOCUMENTOS", groups: [{ name: "Grupo", responses: ["Sim", "Não"], irregularResponse: "Não", items: [{ number: 1, question: "Documento válido?" }] }] });
    const input = { planId: plan.id, checklistId: edition.id, selectedNumbers: [1], title: "Ciclo inicial", description: "Conferência", startAt: new Date("2026-10-01"), endAt: new Date("2026-10-10"), responseDueAt: new Date("2099-10-20"), auditorId: "ana", recipientId: "beatriz", costCenterId: "audit-center", documentIds: [], idempotencyKey: "S1" };
    const audit = await scheduleControlAudit(f.db, owner, input);
    await sendControlAudit(f.db, owner, { auditId: audit.id, reason: "Envio", idempotencyKey: "E1" });
    await respondControlAudit(f.db, recipient, { auditId: audit.id, answers: [{ number: 1, response: "Não", reason: "Ausente" }], documentIds: [], idempotencyKey: "R1" });
    await f.pg.exec(`CREATE FUNCTION reject_audit_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='AUDIT_REVIEW' THEN RAISE EXCEPTION 'audit review rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_audit_review BEFORE INSERT ON "InternalControlEvent" FOR EACH ROW EXECUTE FUNCTION reject_audit_review();`);
    await assert.rejects(reviewControlAudit(f.db, owner, { auditId: audit.id, accepted: true, analyses: [{ number: 1, conclusion: "IRREGULAR", reason: "Ausência", correctiveAction: "Regularizar" }], reason: "Análise", documentIds: [], idempotencyKey: "A1" }), /audit review rollback/);
    assert.equal(await f.db.internalControlFinding.count({ where: { planId: plan.id } }), 0);
    const copy = await scheduleControlAudit(f.db, owner, { ...input, originAuditId: audit.id, title: "Novo ciclo", idempotencyKey: "S2" });
    assert.equal(readControlAudit(copy.snapshot)?.originAuditId, audit.id);
    assert.equal(await f.db.internalControlEvent.count({ where: { snapshot: { path: ["auditId"], equals: copy.id } } }), 0);
  } finally { await f.close(); }
});
