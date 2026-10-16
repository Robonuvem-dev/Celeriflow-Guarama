import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { executeAnnualPayableRegistration } from "../src/lib/financeiro/annual-payable-registration";
import { configureAccountingPostingRule, createCommitment, createSettlement, createCommitmentMovement, prepareAnnualAccountingClose, finalizeAnnualAccountingClose, setFinancialYearStatus, requestAccountingMonthReopen, authorizeAccountingMonthReopen, requestAccountingMonthClose, authorizeAccountingMonthClose, reregisterPayableCarryForward } from "../src/lib/financeiro";
import { executeAnnualRapPostings } from "../src/lib/financeiro/annual-rap-postings";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Inscrição anual ${jurisdiction}: concorrência, tipos, desmovimentação e reapuração de saldo zero`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      const reviewer = { ...actor, usuarioId: "beatriz" };
      await setFinancialYearStatus(f.db, actor, "ano", "Aberto");
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("annual-rap-reserve", "4.50");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "ANNUAL-RAP", value: "4.50", type: "Estimativo", history: "Despesa com saldo a inscrever", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await f.db.accountingEntry.updateMany({ where: { transaction: { sourceType: "COMMITMENT", sourceId: commitment.id } }, data: { classificationSnapshot: { dimensions: { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null } } } });
      await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      const input = { financialYearId: "ano", operation: "REGISTER" as const, reason: "Apuração individual no encerramento", requestKey: "register-1" };
      await assert.rejects(executeAnnualPayableRegistration(f.db, f.actor, input), /todas as UGs/);
      await assert.rejects(executeAnnualPayableRegistration(f.db, actor, input), /doze competências/);
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
      const concurrent = await Promise.all([executeAnnualPayableRegistration(f.db, actor, input), executeAnnualPayableRegistration(f.db, actor, input)]);
      assert.equal(concurrent.filter(result => result.replay).length, 1);
      const inscriptions = await f.db.payableCarryForward.findMany({ where: { commitmentId: commitment.id }, orderBy: { type: "asc" } });
      assert.equal(inscriptions.length, 2);
      assert.deepEqual(inscriptions.map(row => [row.type, row.valueDecimal.toFixed(2)]), [["NAO_PROCESSADO", "2.25"], ["PROCESSADO", "2.25"]]);
      const originalIds = inscriptions.map(row => row.id).sort();
      await prepareAnnualAccountingClose(f.db, actor, "ano");
      const undo = { ...input, operation: "UNDO" as const, reason: "Revisão independente da inscrição", requestKey: "undo-1" };
      await executeAnnualPayableRegistration(f.db, actor, undo);
      assert.equal((await executeAnnualPayableRegistration(f.db, actor, undo)).replay, true);
      assert.equal(await f.db.payableCarryForward.count({ where: { status: "INSCRICAO_DESMOVIMENTADA" } }), 2);
      await assert.rejects(finalizeAnnualAccountingClose(f.db, reviewer, "ano"), /Prepare o encerramento/);
      await executeAnnualPayableRegistration(f.db, actor, { ...input, requestKey: "register-2" });
      assert.deepEqual((await f.db.payableCarryForward.findMany({ select: { id: true } })).map(row => row.id).sort(), originalIds);
      await setFinancialYearStatus(f.db, actor, "ano", "Aberto");
      const september = new Date("2026-09-01");
      await requestAccountingMonthReopen(f.db, actor, "ano", september, "Correção documental do saldo não liquidado.");
      await authorizeAccountingMonthReopen(f.db, reviewer, "ano", september);
      await createCommitmentMovement(f.db, f.actor, { commitmentId: commitment.id, date: new Date("2026-09-05"), type: "Anulação", value: "2.25", justification: "Anulação nativa do saldo estimativo não liquidado" });
      await requestAccountingMonthClose(f.db, actor, "ano", september);
      await authorizeAccountingMonthClose(f.db, reviewer, "ano", september);
      await executeAnnualPayableRegistration(f.db, actor, { ...input, requestKey: "register-3" });
      const unprocessed = await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: inscriptions[0].id } });
      assert.equal(unprocessed.status, "INSCRICAO_DESMOVIMENTADA");
      assert.equal(unprocessed.valueDecimal.toFixed(2), "2.25", "A desmovimentação preserva o valor histórico da inscrição.");
      await prepareAnnualAccountingClose(f.db, actor, "ano");
      await assert.rejects(finalizeAnnualAccountingClose(f.db, reviewer, "ano"), /partidas específicas/);
      await configureAccountingPostingRule(f.db, actor, { eventCode: "RAP_PROCESSADO_INSCRICAO", eventName: "Inscrição processada", debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      await executeAnnualRapPostings(f.db, actor, { financialYearId: "ano", reason: "Publicação específica da inscrição processada", requestKey: "processed-posting" });
      await finalizeAnnualAccountingClose(f.db, reviewer, "ano");
      await assert.rejects(executeAnnualPayableRegistration(f.db, actor, { ...undo, requestKey: "undo-after-final" }), /anterior à validação final/);
      assert.equal(await f.db.payableCarryForward.count(), 2);
    } finally { context.mock.timers.reset(); await f.close(); }
  });

  test(`Inscrição anual ${jurisdiction}: transporte posterior impede desmovimentação com rollback`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await setFinancialYearStatus(f.db, actor, "ano", "Aberto");
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("annual-guard-reserve", "2.25");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "ANNUAL-GUARD", value: "2.25", type: "Ordinário", history: "Obrigação com etapa posterior", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
      const input = { financialYearId: "ano", operation: "REGISTER" as const, reason: "Inscrição anual", requestKey: "guard-register" };
      await executeAnnualPayableRegistration(f.db, actor, input);
      await f.db.financialYear.create({ data: { id: "next", year: 2027, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") } });
      const source = await f.db.payableCarryForward.findFirstOrThrow({ where: { commitmentId: commitment.id } });
      await reregisterPayableCarryForward(f.db, f.actor, { payableCarryForwardId: source.id, targetFinancialYearId: "next", justification: "Reinscrição documental posterior" });
      const count = await f.db.payableCarryForwardEvent.count();
      await assert.rejects(executeAnnualPayableRegistration(f.db, actor, { ...input, operation: "UNDO", requestKey: "guard-undo" }), /transporte posterior/);
      assert.equal(await f.db.payableCarryForwardEvent.count(), count);
      assert.equal((await f.db.payableCarryForward.findUniqueOrThrow({ where: { id: source.id } })).status, "REINSCRITO");
      await assert.rejects(executeAnnualPayableRegistration(f.db, actor, { ...input, reason: "Chave reutilizada" }), /outros dados/);
    } finally { context.mock.timers.reset(); await f.close(); }
  });
}
