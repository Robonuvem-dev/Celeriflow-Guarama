import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { closeDailyTreasuryByAccountAndSource, generateTreasuryBankStatement } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Tesouraria ${jurisdiction}: extrato conserva centavos e fechamento confere a fonte`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      await db.insert(reconciliationTreasuryMovements).values([
        { id: "opening", resourceSourceId: "livre", financialYearId: "ano", bankAccountId: "banco", date: new Date("2026-09-01"), type: "OpeningBalance", direction: "ENTRADA", valueDecimal: new Decimal("0.10"), status: "Confirmado" },
        { id: "a-entry", resourceSourceId: "livre", financialYearId: "ano", bankAccountId: "banco", date: new Date("2026-09-02"), type: "Revenue", direction: "CREDIT", valueDecimal: new Decimal("0.20"), status: "Confirmado" },
        { id: "b-exit", resourceSourceId: "livre", financialYearId: "ano", bankAccountId: "banco", date: new Date("2026-09-02"), type: "Payment", direction: "SAIDA", valueDecimal: new Decimal("0.30"), status: "Confirmado" },
      ]);
      const statement = await generateTreasuryBankStatement(db, { bankAccountId: "banco", startDate: new Date("2026-09-02"), endDate: new Date("2026-09-02T23:59:59.999Z") });
      assert.equal(statement.openingBalance, 0.1);
      assert.equal(statement.closingBalance, 0);
      assert.deepEqual(statement.statementItems.map(row => [row.id, row.runningBalance]), [["a-entry", 0.3], ["b-exit", 0]]);
      await assert.rejects(generateTreasuryBankStatement(db, { bankAccountId: "banco", startDate: new Date("2026-09-03"), endDate: new Date("2026-09-02") }), /período válido/);
      const auditCount = async () => (await db.select({ total: count() }).from(financialAuditLogs))[0].total;
      const auditsBefore = await auditCount();
      await assert.rejects(closeDailyTreasuryByAccountAndSource(connection, f.actor, { bankAccountId: "banco", resourceSourceId: "vinculada", date: new Date("2026-09-02") }), /fonte.*autorizada/);
      await assert.rejects(closeDailyTreasuryByAccountAndSource(connection, { ...f.actor, allowedBudgetUnitIds: [] }, { bankAccountId: "banco", date: new Date("2026-09-02") }), /Acesso negado à Unidade Gestora/);
      assert.equal(await auditCount(), auditsBefore);
      const close = await closeDailyTreasuryByAccountAndSource(connection, f.actor, { bankAccountId: "banco", resourceSourceId: "livre", date: new Date("2026-09-02") });
      assert.equal(close.openingBalance, 0.1);
      assert.equal(close.totalEntries, 0.2);
      assert.equal(close.totalExits, 0.3);
      assert.equal(close.closingBalance, 0);
      const [audit] = await db.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "DAILY_TREASURY_CLOSE"), eq(financialAuditLogs.entityId, "banco"))).limit(1);
      assert.ok(audit);
      assert.equal((audit.payload as { resourceSourceId: string }).resourceSourceId, "livre");
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });
}
