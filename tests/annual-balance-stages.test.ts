import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { executeAnnualBalanceStage, undoAnnualResultStage } from "../src/lib/financeiro/annual-balance-stages";
import { finalizeAnnualAccountingClose, postAccountingTransaction } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Etapas anuais ${jurisdiction}: abertura provisória, resultado e reedição preservam IC e movimento corrente`, async () => {
    const f = await createPlanningExecutionFixture(2025, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
      await f.db.financialYear.create({ data: { id: "next", year: 2026, governmentEntityId: "ente", status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") } });
      await f.db.accountingPlan.create({ data: { id: "vpa", code: "ORIGIN.VPA", name: "VPA do exercício", type: "VPA" } });
      await f.db.accountingPlan.create({ data: { id: "annual-asset", code: "ORIGIN.ASSET", name: "Direito patrimonial", type: "Ativo" } });
      await f.db.accountingPlan.create({ data: { id: "annual-result", code: "ORIGIN.RESULT", name: "Resultado acumulado", type: "Passivo" } });
      const ic = { status: "DOCUMENTED", informationPairs: 6, accountCode: "111110100", information: { PO: jurisdiction === "EXECUTIVE" ? "10131" : "20231", FP: "1", FR: "1500" }, pairs: [{ type: "FR", value: "1500" }] };
      const dimensions = { governmentEntityId: "ente", budgetUnitId: "ug", resourceSourceId: "livre", sourceClassification: null, budgetDimensions: null, msc: ic };
      // Documentary prior-year journal, with immutable classifications captured before the annual service.
      await f.db.accountingTransaction.create({ data: { id: "source-journal", date: new Date("2025-09-01"), financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", status: "POSTADO", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, history: "Direito constituído na origem", entries: { create: [
        { id: "source-cash", date: new Date("2025-09-01"), accountId: "annual-asset", type: "Débito", value: 30, valueDecimal: "30.00", authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "1.1.1.1.1.01", dimensions } },
        { id: "source-vpa", date: new Date("2025-09-01"), accountId: "vpa", type: "Crédito", value: 30, valueDecimal: "30.00", authorId: actor.employeeId!, history: "Origem", classificationSnapshot: { externalCode: "4.1.1.1", dimensions: { ...dimensions, msc: null } } },
      ] } } });
      const openingInput = { stage: "OPENING" as const, sourceFinancialYearId: "ano", targetFinancialYearId: "next", resultAccountId: "annual-result", reason: "Abertura patrimonial do novo exercício", requestKey: "opening-1" };
      await assert.rejects(postAccountingTransaction(f.db, actor, { financialYearId: "next", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01"), history: "Origem anual sem edição", lines: [{ accountId: "annual-asset", type: "Débito", value: "30.00", annualBalanceOriginEntryId: "source-cash" }, { accountId: "annual-result", type: "Crédito", value: "30.00", annualBalanceOriginEntryId: "source-cash" }] }), /edição documental/);
      await assert.rejects(executeAnnualBalanceStage(f.db, f.actor, openingInput), /todas as UGs/);
      const concurrentOpenings = await Promise.all([executeAnnualBalanceStage(f.db, actor, openingInput), executeAnnualBalanceStage(f.db, actor, openingInput)]);
      assert.equal(concurrentOpenings.filter(result => result.replay).length, 1);
      const opening = concurrentOpenings.find(result => !result.replay)!;
      assert.equal(opening.provisional, true);
      const carried = await f.db.accountingEntry.findFirstOrThrow({ where: { accountId: "annual-asset", transaction: { sourceId: opening.editionId } } });
      assert.deepEqual(((carried.classificationSnapshot as Prisma.JsonObject).dimensions as Prisma.JsonObject).msc, ic);
      const firstMemory = (await f.db.financialAuditLog.findUniqueOrThrow({ where: { id: opening.editionId } })).payload as Prisma.JsonObject;
      assert.equal((firstMemory.financialPosition as Prisma.JsonObject).status, "NOT_RECONCILED", "As partidas orçamentárias anteriores da fixture não possuem indicador financeiro documental.");
      assert.equal((((firstMemory.financialPosition as Prisma.JsonObject).rows as Prisma.JsonArray)[0] as Prisma.JsonObject).deficitSurplus, "30.00");
      assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Aberto");
      const current = await postAccountingTransaction(f.db, actor, { financialYearId: "next", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-09-01"), history: "Atividade corrente com exercício anterior aberto", sourceModule: "FINANCEIRO", sourceType: "BANK_ACCOUNT", sourceId: "banco", idempotencyKey: "current", lines: [{ accountId: "annual-asset", type: "Débito", value: "5.00" }, { accountId: "annual-result", type: "Crédito", value: "5.00" }] });
      await postAccountingTransaction(f.db, actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2025-12-30"), history: "Ajuste anterior ao encerramento", sourceModule: "FINANCEIRO", sourceType: "BANK_ACCOUNT", sourceId: "banco", idempotencyKey: "source-adjustment", lines: [{ accountId: "annual-asset", type: "Débito", value: "2.00" }, { accountId: "vpa", type: "Crédito", value: "2.00" }] });
      const closeInput = { stage: "RESULT_CLOSE" as const, sourceFinancialYearId: "ano", targetFinancialYearId: "ano", resultAccountId: "annual-result", reason: "Apuração patrimonial do resultado", requestKey: "result-close-1" };
      await assert.rejects(executeAnnualBalanceStage(f.db, actor, closeInput), /doze competências/);
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2025, month, 1)), status: "FECHADO" })) });
      await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Em Encerramento" } });
      await f.db.annualAccountingClose.create({ data: { financialYearId: "ano", status: "PRONTO_PARA_VALIDACAO", preparedByUsuarioId: actor.usuarioId, preparedAt: new Date() } });
      await assert.rejects(finalizeAnnualAccountingClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano"), /saldos de VPD\/VPA/);
      const closing = await executeAnnualBalanceStage(f.db, actor, closeInput);
      assert.equal(closing.replay, false);
      await assert.rejects(undoAnnualResultStage(f.db, f.actor, { editionId: closing.editionId, reason: "Conferência" }), /todas as UGs/);
      const undone = await undoAnnualResultStage(f.db, actor, { editionId: closing.editionId, reason: "Revisão documental da apuração" });
      assert.equal(undone.replay, false);
      assert.equal((await undoAnnualResultStage(f.db, actor, { editionId: closing.editionId, reason: "Revisão documental da apuração" })).replay, true);
      const newClosing = await executeAnnualBalanceStage(f.db, actor, { ...closeInput, requestKey: "result-close-2" });
      const vpa = await f.db.accountingEntry.findMany({ where: { accountId: "vpa", transaction: { financialYearId: "ano", status: "POSTADO" } } });
      assert.equal(vpa.reduce((sum, entry) => entry.type === "Débito" ? sum.plus(entry.valueDecimal!) : sum.minus(entry.valueDecimal!), new Prisma.Decimal(0)).toFixed(2), "0.00");
      await executeAnnualBalanceStage(f.db, actor, { ...openingInput, requestKey: "opening-after-result" });
      await assert.rejects(undoAnnualResultStage(f.db, actor, { editionId: newClosing.editionId, reason: "Revisão após abertura dependente" }), /abertura posterior dependente/);
      await finalizeAnnualAccountingClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano");
      const updated = await executeAnnualBalanceStage(f.db, actor, { ...openingInput, requestKey: "opening-2" });
      assert.equal(updated.provisional, false);
      await assert.rejects(undoAnnualResultStage(f.db, actor, { editionId: newClosing.editionId, reason: "Revisão após encerramento" }), /anterior à validação final/);
      assert.equal((await f.db.accountingTransaction.findUniqueOrThrow({ where: { id: current.id } })).status, "POSTADO");
      const balance = async () => (await f.db.accountingEntry.findMany({ where: { accountId: "annual-asset", transaction: { financialYearId: "next", status: "POSTADO" } } })).reduce((sum, entry) => entry.type === "Débito" ? sum.plus(entry.valueDecimal!) : sum.minus(entry.valueDecimal!), new Prisma.Decimal(0));
      assert.equal((await balance()).toFixed(2), "37.00");
      const count = await f.db.accountingTransaction.count();
      const updatedMemory = (await f.db.financialAuditLog.findUniqueOrThrow({ where: { id: updated.editionId } })).payload as Prisma.JsonObject;
      assert.equal((updatedMemory.financialPosition as Prisma.JsonObject).status, "NOT_RECONCILED");
      assert.equal((await executeAnnualBalanceStage(f.db, actor, { ...openingInput, requestKey: "opening-2" })).replay, true);
      assert.equal(await f.db.accountingTransaction.count(), count);
      await assert.rejects(executeAnnualBalanceStage(f.db, actor, { ...openingInput, requestKey: "opening-2", reason: "Outra configuração" }), /outra configuração/);
      await f.db.monthlyAccountingClose.create({ data: { financialYearId: "next", competence: new Date("2026-01-01"), status: "FECHADO" } });
      await assert.rejects(executeAnnualBalanceStage(f.db, actor, { ...openingInput, requestKey: "opening-3" }), /competencia contabil nao esta aberta/);
      assert.equal(await f.db.accountingTransaction.count(), count);
      assert.equal((await balance()).toFixed(2), "37.00");
    } finally { await f.close(); }
  });
}
