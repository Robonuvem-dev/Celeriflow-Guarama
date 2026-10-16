import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { captureAnnualConsistencyReport } from "../src/lib/financeiro/annual-consistency";
import { prepareAnnualAccountingClose } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Conferência anual ${jurisdiction}: perímetro integral, pendências detalhadas e memória da emissão`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await assert.rejects(captureAnnualConsistencyReport(f.db, f.actor, "ano"), /todas as UGs/);
      assert.equal(await f.db.financialAuditLog.count({ where: { action: "ANNUAL_CONSISTENCY_REPORT" } }), 0);
      await f.db.accountingTransaction.create({ data: { id: "draft-to-close", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-11-01"), history: "Documento ainda em preparação", status: "RASCUNHO", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId } });
      await f.db.accountingTransaction.create({ data: { id: "invalid-journal", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-11-01"), history: "Partida sem contraparte para conferir a crítica", status: "POSTADO", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, entries: { create: { date: new Date("2026-11-01"), accountId: "debito", type: "Débito", value: 3, valueDecimal: "3.00", authorId: actor.employeeId!, history: "Partida incompleta" } } } });
      await f.db.treasuryMovement.create({ data: { id: "legacy-source-pending", bankAccountId: "banco", financialYearId: "ano", date: new Date("2026-10-01"), type: "RECEITA", direction: "Entrada", valueDecimal: "3.00", status: "Confirmado" } });
      const report = await captureAnnualConsistencyReport(f.db, actor, "ano");
      assert.equal(report.fullEntity, true);
      assert.equal(report.issues.filter(issue => issue.code === "MONTH_NOT_CLOSED").length, 12);
      assert.ok(report.issues.some(issue => issue.code === "DRAFT_POSTINGS"));
      assert.ok(report.issues.some(issue => issue.code === "UNBALANCED_POSTING" && issue.entityId === "invalid-journal" && issue.message.includes("3.00")));
      assert.ok(report.issues.some(issue => issue.code === "BANK_SOURCE" && issue.entityId === "legacy-source-pending"));
      const audit = await f.db.financialAuditLog.findUniqueOrThrow({ where: { id: report.reportId } });
      assert.equal(audit.authorUsuarioId, actor.usuarioId);
      assert.equal((audit.payload as Prisma.JsonObject).governmentEntityId, "ente");
      const before = JSON.stringify(audit.payload);
      await f.db.monthlyAccountingClose.createMany({ data: Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })) });
      const second = await captureAnnualConsistencyReport(f.db, actor, "ano");
      assert.notEqual(report.reportId, second.reportId);
      assert.equal(second.issues.filter(issue => issue.code === "MONTH_NOT_CLOSED").length, 0);
      assert.equal(JSON.stringify((await f.db.financialAuditLog.findUniqueOrThrow({ where: { id: report.reportId } })).payload), before);
      assert.equal((await f.db.treasuryMovement.findUniqueOrThrow({ where: { id: "legacy-source-pending" } })).resourceSourceId, null);
      await f.db.accountingTransaction.update({ where: { id: "draft-to-close" }, data: { status: "ANULADO" } });
      await assert.rejects(prepareAnnualAccountingClose(f.db, actor, "ano"), /inconsistências/);
      assert.equal(await f.db.annualAccountingClose.count(), 0);
    } finally { await f.close(); }
  });
}
