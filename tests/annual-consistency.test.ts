import assert from "node:assert/strict";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import type { JsonObject } from "../src/db/json";
import { accountingEntries, accountingTransactions, annualAccountingCloses, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { captureAnnualConsistencyReport } from "../src/lib/financeiro/annual-consistency";
import { prepareAnnualAccountingClose } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`Conferência anual ${jurisdiction}: perímetro integral, pendências detalhadas e memória da emissão`, async () => {
    const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    let finance: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
    try {
      finance = await connectFinanceDrizzleFixture(f.pg);
      const { connection } = finance;
      const db = connection.db;
      const actor = { usuarioId: f.actor.usuarioId, employeeId: f.actor.employeeId };
      await assert.rejects(captureAnnualConsistencyReport(connection, f.actor, "ano"), /todas as UGs/);
      assert.equal((await db.select({ total: count() }).from(financialAuditLogs).where(eq(financialAuditLogs.action, "ANNUAL_CONSISTENCY_REPORT")))[0].total, 0);
      await db.insert(accountingTransactions).values({ id: "draft-to-close", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-11-01"), history: "Documento ainda em preparação", status: "RASCUNHO", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
      await db.transaction(async tx => {
        await tx.insert(accountingTransactions).values({ id: "invalid-journal", financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-11-01"), history: "Partida sem contraparte para conferir a crítica", status: "POSTADO", authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
        await tx.insert(accountingEntries).values({ transactionId: "invalid-journal", date: new Date("2026-11-01"), accountId: "debito", type: "Débito", value: 3, valueDecimal: new Decimal("3.00"), authorId: actor.employeeId!, history: "Partida incompleta" });
      });
      await db.insert(reconciliationTreasuryMovements).values({ id: "legacy-source-pending", bankAccountId: "banco", financialYearId: "ano", date: new Date("2026-10-01"), type: "RECEITA", direction: "Entrada", valueDecimal: new Decimal("3.00"), status: "Confirmado" });
      const report = await captureAnnualConsistencyReport(connection, actor, "ano");
      assert.equal(report.fullEntity, true);
      assert.equal(report.issues.filter(issue => issue.code === "MONTH_NOT_CLOSED").length, 12);
      assert.ok(report.issues.some(issue => issue.code === "DRAFT_POSTINGS"));
      assert.ok(report.issues.some(issue => issue.code === "UNBALANCED_POSTING" && issue.entityId === "invalid-journal" && issue.message.includes("3.00")));
      assert.ok(report.issues.some(issue => issue.code === "BANK_SOURCE" && issue.entityId === "legacy-source-pending"));
      const [audit] = await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.id, report.reportId));
      assert.ok(audit);
      assert.equal(audit.authorUsuarioId, actor.usuarioId);
      assert.equal((audit.payload as JsonObject).governmentEntityId, "ente");
      const before = JSON.stringify(audit.payload);
      await db.insert(monthlyAccountingCloses).values(Array.from({ length: 12 }, (_, month) => ({ financialYearId: "ano", competence: new Date(Date.UTC(2026, month, 1)), status: "FECHADO" })));
      const second = await captureAnnualConsistencyReport(connection, actor, "ano");
      assert.notEqual(report.reportId, second.reportId);
      assert.equal(second.issues.filter(issue => issue.code === "MONTH_NOT_CLOSED").length, 0);
      assert.equal(JSON.stringify((await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.id, report.reportId)))[0].payload), before);
      assert.equal((await db.select().from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.id, "legacy-source-pending")))[0].resourceSourceId, null);
      await db.update(accountingTransactions).set({ status: "ANULADO" }).where(eq(accountingTransactions.id, "draft-to-close"));
      await assert.rejects(prepareAnnualAccountingClose(connection, actor, "ano"), /inconsistências/);
      assert.equal((await db.select({ total: count() }).from(annualAccountingCloses))[0].total, 0);
    } finally { try { await finance?.close(); } finally { await f.close(); } }
  });
}
