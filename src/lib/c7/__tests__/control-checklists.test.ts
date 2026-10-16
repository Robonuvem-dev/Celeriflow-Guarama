import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlanningAccountingFixture } from "../../../../tests/helpers/planning-accounting-fixture";
import { createInternalControlPlan, resolveInternalControlFinding, transitionInternalControlPlan } from "../operations-service";
import { publishControlChecklist, answerControlChecklist, runControlChecklistDiagnostics } from "../control-checklists";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`Controle ${jurisdiction}: edição, respostas, achado atômico, replay e fechamento`, async () => {
  const f = await createPlanningAccountingFixture(jurisdiction);
  try {
    const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
    const plan = await createInternalControlPlan(f.db, actor, { title: "Auditoria municipal", reference: "Exercício 2026", budgetUnitId: "ug" });
    const config = { planId: plan.id, title: "Tesouraria", category: "Financeiro", groups: [{ name: "Conciliação", responses: ["Sim", "Não", "Inaplicável"], irregularResponse: "Não", items: [{ number: 1, question: "Conciliação concluída?" }] }] };
    await assert.rejects(publishControlChecklist(f.db, actor, { ...config, groups: [{ ...config.groups[0], items: [{ number: 1, question: "A" }, { number: 1, question: "B" }] }] }), /número inteiro/);
    const edition = await publishControlChecklist(f.db, actor, config);
    const decision = { planId: plan.id, status: "CONCLUIDO" as const, reason: "Avaliação encerrada" };
    await assert.rejects(transitionInternalControlPlan(f.db, actor, decision), /todos os itens/);
    const input = { checklistId: edition.id, number: 1, response: "Não", reason: "Conciliação pendente documentada" };
    await assert.rejects(answerControlChecklist(f.db, { ...actor, allowedBudgetUnitIds: [] }, input), /unidades gestoras/);
    await assert.rejects(answerControlChecklist(f.db, actor, { ...input, response: "Outra" }), /não pertence/);
    await f.pg.exec(`CREATE FUNCTION fail_checklist_answer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CHECKLIST_ANSWERED' THEN RAISE EXCEPTION 'answer rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_checklist_answer BEFORE INSERT ON "InternalControlEvent" FOR EACH ROW EXECUTE FUNCTION fail_checklist_answer();`);
    await assert.rejects(answerControlChecklist(f.db, actor, input), /answer rollback/);
    assert.equal(await f.db.internalControlFinding.count({ where: { planId: plan.id } }), 0);
    await f.pg.exec('DROP TRIGGER fail_checklist_answer ON "InternalControlEvent"; DROP FUNCTION fail_checklist_answer();');
    const results = await Promise.all([answerControlChecklist(f.db, actor, input), answerControlChecklist(f.db, actor, input)]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(await f.db.internalControlFinding.count({ where: { planId: plan.id } }), 1);
    await assert.rejects(answerControlChecklist(f.db, actor, { ...input, response: "Sim" }), /outros dados/);
    await assert.rejects(transitionInternalControlPlan(f.db, actor, decision), /todos os apontamentos/);
    await resolveInternalControlFinding(f.db, actor, results[0].findingId!, "Conciliação realizada e conferida");
    assert.equal((await transitionInternalControlPlan(f.db, actor, decision)).status, "CONCLUIDO");
    assert.deepEqual((await f.db.internalControlEvent.findUniqueOrThrow({ where: { id: edition.id } })).snapshot, edition.snapshot);
    await assert.rejects(answerControlChecklist(f.db, actor, input), /plano de controle aberto/);
    const diagnosticPlan = await createInternalControlPlan(f.db, actor, { title: "Conferência bancária", reference: "Fontes da tesouraria", budgetUnitId: "ug" });
    const diagnosticConfig = { ...config, planId: diagnosticPlan.id, groups: [{ ...config.groups[0], items: [{ number: 1, question: "Contas possuem fonte?", diagnosticRule: "BANK_ACCOUNT_SOURCE" as const }] }] };
    const diagnosticEdition = await publishControlChecklist(f.db, actor, diagnosticConfig);
    await assert.rejects(runControlChecklistDiagnostics(f.db, actor, diagnosticEdition.id), /Sem contas bancárias/);
    assert.equal(await f.db.internalControlEvent.count({ where: { planId: diagnosticPlan.id, eventType: "CHECKLIST_ANSWERED" } }), 0);
    await f.db.bankAccount.create({ data: { id: "control-bank", bankName: "Banco da fixture", agency: "0001", accountNumber: "0001", budgetUnitId: "ug", resourceSourceId: "livre" } });
    await f.db.bankAccount.create({ data: { id: "other-control-bank", bankName: "Banco da outra UG", agency: "0002", accountNumber: "0002", budgetUnitId: "ug-restrita" } });
    await assert.rejects(answerControlChecklist(f.db, actor, { ...input, checklistId: diagnosticEdition.id, response: "Sim" }), /diagnóstico automático/);
    const [regular] = await runControlChecklistDiagnostics(f.db, actor, diagnosticEdition.id);
    assert.equal(regular.findingId, null);
    assert.equal((await runControlChecklistDiagnostics(f.db, actor, diagnosticEdition.id))[0].id, regular.id);
    await f.db.bankAccount.update({ where: { id: "control-bank" }, data: { resourceSourceId: null } });
    await assert.rejects(runControlChecklistDiagnostics(f.db, actor, diagnosticEdition.id), /outros dados/);
    const newEdition = await publishControlChecklist(f.db, actor, diagnosticConfig);
    const [irregular] = await runControlChecklistDiagnostics(f.db, actor, newEdition.id);
    assert.ok(irregular.findingId);
    assert.equal(await f.db.internalControlFinding.count({ where: { planId: diagnosticPlan.id } }), 1);
    assert.deepEqual((await f.db.internalControlEvent.findUniqueOrThrow({ where: { id: regular.id } })).snapshot, regular.snapshot);
  } finally { await f.close(); }
});

test("Controle: cópia selecionada conserva origem e não replica respostas", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
    const plan = await createInternalControlPlan(f.db, actor, { title: "Controle municipal", reference: "Exercício 2026", budgetUnitId: "ug" });
    const original = await publishControlChecklist(f.db, actor, { planId: plan.id, title: "Edição de origem", category: "Financeiro", groups: [{ name: "Despesas", responses: ["Regular", "Irregular"], irregularResponse: "Irregular", items: [{ number: 1, question: "Empenho conferido?" }, { number: 2, question: "Liquidação conferida?" }] }] });
    await answerControlChecklist(f.db, actor, { checklistId: original.id, number: 1, response: "Regular", reason: "Conferência documental concluída" });
    const copy = await publishControlChecklist(f.db, actor, { planId: plan.id, title: "Nova edição", category: "Financeiro", copiedFromId: original.id, selectedSourceNumbers: [2], groups: [{ name: "Liquidações", responses: ["Regular", "Irregular"], irregularResponse: "Irregular", items: [{ number: 2, question: "Liquidação e ateste conferidos?" }] }] });
    const memory = copy.snapshot as { provenance: { sourceEditionId: string; selectedSourceNumbers: number[]; sourceSnapshotHash: string } };
    assert.equal(memory.provenance.sourceEditionId, original.id); assert.deepEqual(memory.provenance.selectedSourceNumbers, [2]); assert.match(memory.provenance.sourceSnapshotHash, /^[a-f0-9]{64}$/);
    assert.equal(await f.db.internalControlEvent.count({ where: { eventType: "CHECKLIST_ANSWERED", snapshot: { path: ["checklistId"], equals: copy.id } } }), 0);
    assert.deepEqual((await f.db.internalControlEvent.findUniqueOrThrow({ where: { id: original.id } })).snapshot, original.snapshot);
    await assert.rejects(publishControlChecklist(f.db, actor, { planId: plan.id, title: "Seleção inválida", category: "Financeiro", copiedFromId: original.id, selectedSourceNumbers: [99], groups: [{ name: "Grupo", responses: ["Regular", "Irregular"], irregularResponse: "Irregular", items: [{ number: 99, question: "Pergunta" }] }] }), /Seleção de itens/);
  } finally { await f.close(); }
});
