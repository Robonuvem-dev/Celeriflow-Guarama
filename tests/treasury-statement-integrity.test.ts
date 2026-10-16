import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { closeDailyTreasuryByAccountAndSource, generateTreasuryBankStatement } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Tesouraria ${jurisdiction}: extrato conserva centavos e fechamento confere a fonte`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    try {
      await f.db.treasuryMovement.createMany({ data: [
        { id: "opening", resourceSourceId: "livre", financialYearId: "ano", bankAccountId: "banco", date: new Date("2026-09-01"), type: "OpeningBalance", direction: "ENTRADA", valueDecimal: "0.10", status: "Confirmado" },
        { id: "a-entry", resourceSourceId: "livre", financialYearId: "ano", bankAccountId: "banco", date: new Date("2026-09-02"), type: "Revenue", direction: "CREDIT", valueDecimal: "0.20", status: "Confirmado" },
        { id: "b-exit", resourceSourceId: "livre", financialYearId: "ano", bankAccountId: "banco", date: new Date("2026-09-02"), type: "Payment", direction: "SAIDA", valueDecimal: "0.30", status: "Confirmado" },
      ] });
      const statement = await generateTreasuryBankStatement(f.db, { bankAccountId: "banco", startDate: new Date("2026-09-02"), endDate: new Date("2026-09-02T23:59:59.999Z") });
      assert.equal(statement.openingBalance, 0.1);
      assert.equal(statement.closingBalance, 0);
      assert.deepEqual(statement.statementItems.map(row => [row.id, row.runningBalance]), [["a-entry", 0.3], ["b-exit", 0]]);
      await assert.rejects(generateTreasuryBankStatement(f.db, { bankAccountId: "banco", startDate: new Date("2026-09-03"), endDate: new Date("2026-09-02") }), /período válido/);
      const auditsBefore = await f.db.financialAuditLog.count();
      await assert.rejects(closeDailyTreasuryByAccountAndSource(f.db, f.actor, { bankAccountId: "banco", resourceSourceId: "vinculada", date: new Date("2026-09-02") }), /fonte.*autorizada/);
      await assert.rejects(closeDailyTreasuryByAccountAndSource(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, { bankAccountId: "banco", date: new Date("2026-09-02") }), /Acesso negado à Unidade Gestora/);
      assert.equal(await f.db.financialAuditLog.count(), auditsBefore);
      const close = await closeDailyTreasuryByAccountAndSource(f.db, f.actor, { bankAccountId: "banco", resourceSourceId: "livre", date: new Date("2026-09-02") });
      assert.equal(close.openingBalance, 0.1);
      assert.equal(close.totalEntries, 0.2);
      assert.equal(close.totalExits, 0.3);
      assert.equal(close.closingBalance, 0);
      const audit = await f.db.financialAuditLog.findFirstOrThrow({ where: { action: "DAILY_TREASURY_CLOSE", entityId: "banco" } });
      assert.equal((audit.payload as { resourceSourceId: string }).resourceSourceId, "livre");
    } finally { await f.close(); }
  });
}
