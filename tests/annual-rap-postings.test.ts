import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureAccountingPostingRule, createCommitment, createSettlement, prepareAnnualAccountingClose, finalizeAnnualAccountingClose } from "../src/lib/financeiro";
import { executeAnnualRapPostings } from "../src/lib/financeiro/annual-rap-postings";
import { undoAnnualRapPostingStage } from "../src/lib/financeiro/annual-balance-stages";
import { executeAnnualPayableRegistration } from "../src/lib/financeiro/annual-payable-registration";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Partidas de inscrição RAP ${jurisdiction}: orçamento/DDR, atomicidade, replay e desmovimentação`, async context => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      const reviewer = { ...actor, usuarioId: "beatriz" };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-01").getTime() });
      const reservation = await f.reserve("rap-posting", "4.50");
      context.mock.timers.reset();
      const commitment = await createCommitment(f.db, f.actor, { date: new Date("2026-09-01"), number: "NE-INSCRICAO", value: "4.50", type: "Ordinário", history: "Inscrição com execução parcial", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
      await f.db.accountingEntry.updateMany({ where: { transaction: { sourceType: "COMMITMENT", sourceId: commitment.id } }, data: { classificationSnapshot: { dimensions: { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null } } } });
      await createSettlement(f.db, f.actor, { date: new Date("2026-09-02"), value: "2.25", commitmentId: commitment.id, authorId: "servidora-ana", documentId: "documento-fiscal" });
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
      await prepareAnnualAccountingClose(f.db, actor, "ano");
      const input = { financialYearId: "ano", reason: "Inscrição contábil e DDR do saldo não pago", requestKey: "rap-posting-1" };
      await assert.rejects(executeAnnualRapPostings(f.db, f.actor, input), /todas as UGs/);
      await assert.rejects(finalizeAnnualAccountingClose(f.db, reviewer, "ano"), /partidas específicas/);
      const before = await f.db.accountingTransaction.count();
      await assert.rejects(executeAnnualRapPostings(f.db, actor, input), /matriz explícita/);
      assert.equal(await f.db.accountingTransaction.count(), before);
      await f.db.accountingPlan.createMany({ data: [{ id: "rap-debit", code: "RAP.DEBIT", name: "Inscrição", type: "Ativo" }, { id: "rap-credit", code: "RAP.CREDIT", name: "Inscrição a pagar", type: "Passivo" }, { id: "ddr-debit", code: "DDR.DEBIT", name: "Disponibilidade comprometida", type: "Ativo" }, { id: "ddr-credit", code: "DDR.CREDIT", name: "Controle da inscrição", type: "Passivo" }] });
      for (const eventCode of ["RAP_PROCESSADO_INSCRICAO", "RAP_NAO_PROCESSADO_INSCRICAO"]) await configureAccountingPostingRule(f.db, actor, { eventCode, eventName: "Inscrição composta", debitAccountId: "rap-debit", creditAccountId: "rap-credit", isReference: true, components: [{ debitAccountId: "ddr-debit", creditAccountId: "ddr-credit", valueBasis: "EVENT_VALUE" }] });
      const concurrent = await Promise.all([executeAnnualRapPostings(f.db, actor, input), executeAnnualRapPostings(f.db, actor, input)]);
      assert.equal(concurrent.filter(row => row.replay).length, 1);
      const edition = concurrent.find(row => !row.replay)!;
      const lines = await f.db.accountingEntry.findMany({ where: { transaction: { sourceId: edition.editionId } } });
      assert.equal(lines.length, 8);
      assert.ok(lines.every(row => row.valueDecimal?.eq("2.25") && ((row.classificationSnapshot as Prisma.JsonObject).dimensions as Prisma.JsonObject).resourceSourceId === "livre"));
      await assert.rejects(executeAnnualPayableRegistration(f.db, actor, { financialYearId: "ano", operation: "UNDO", reason: "Revisão das inscrições", requestKey: "undo-blocked" }), /partidas específicas/);
      await configureAccountingPostingRule(f.db, actor, { eventCode: "RAP_PROCESSADO_INSCRICAO", eventName: "Matriz posterior", debitAccountId: "credito", creditAccountId: "debito", isReference: true, components: [] });
      await undoAnnualRapPostingStage(f.db, actor, { editionId: edition.editionId, reason: "Revisão independente das partidas" });
      const reversals = await f.db.accountingEntry.findMany({ where: { transaction: { eventType: "ANNUAL_RAP_REGISTRATION_UNDONE", sourceId: edition.editionId } } });
      assert.equal(reversals.length, 8);
      assert.ok(reversals.every(row => ["rap-debit", "rap-credit", "ddr-debit", "ddr-credit"].includes(row.accountId)), "Estorno conserva a composição anterior, independente da nova matriz.");
      await assert.rejects(finalizeAnnualAccountingClose(f.db, reviewer, "ano"), /partidas específicas/);
      await executeAnnualPayableRegistration(f.db, actor, { financialYearId: "ano", operation: "UNDO", reason: "Desmovimentação separada da inscrição", requestKey: "undo-registrations" });
      await prepareAnnualAccountingClose(f.db, actor, "ano");
      const repeated = await executeAnnualRapPostings(f.db, actor, { ...input, requestKey: "rap-posting-2" });
      await finalizeAnnualAccountingClose(f.db, reviewer, "ano");
      await assert.rejects(undoAnnualRapPostingStage(f.db, actor, { editionId: repeated.editionId, reason: "Tentativa após encerramento final" }), /anterior à validação final/);
    } finally { context.mock.timers.reset(); await f.close(); }
  });
}
