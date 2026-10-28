import assert from "node:assert/strict";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accountingTransactions } from "../src/db/schema/finance-accounting";
import { bankStatementItems } from "../src/db/schema/finance-banking";
import { bankReconciliationAllocationGroups, bankReconciliations, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { revenues } from "../src/db/schema/finance-revenues";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { accountingPendingChecks, getBankAccountLedgerBalance, matchBankStatementItemToTreasuryMovement, recordConfirmedRevenue, requestAccountingMonthClose, setFinancialYearStatus } from "../src/lib/financeiro";
import { allocateBankReconciliation, confirmMunicipalReconciliation, openMunicipalReconciliation, readReconciliationPosition, reopenMunicipalReconciliation, reverseBankReconciliationAllocation } from "../src/lib/financeiro/reconciliation-allocations";
import { runAutoReconciliation } from "../src/lib/financeiro/reconciliation-engine";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import type { DatabaseConnection } from "../src/db/connection";

type Fixture = Awaited<ReturnType<typeof createPlanningExecutionFixture>> & { financeConnection: DatabaseConnection };
async function scenario(jurisdiction: "EXECUTIVE" | "LEGISLATIVE", body: (f: Fixture, sessionId: string, bank: string[], treasury: string[]) => Promise<void>) {
  const prior = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let f: Fixture | undefined;
  let base: Awaited<ReturnType<typeof createPlanningExecutionFixture>> | undefined;
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    base = await createPlanningExecutionFixture(2026, 2, jurisdiction);
    transport = await connectFinanceDrizzleFixture(base.pg);
    f = { ...base, financeConnection: transport.connection };
    const db = f.financeConnection.db;
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    const opening = await getBankAccountLedgerBalance(db, "banco", new Date("2026-02-28T23:59:59.999Z"));
    const treasury: string[] = [];
    for (const [index, value] of ["12.00", "8.00"].entries()) {
      await withDatabaseTransaction(f.financeConnection, (tx) => recordConfirmedRevenue(tx, f!.actor, { date: new Date("2026-03-10"), value, revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "ARRECADACAO", sourceId: `receipt-${index}`, eventType: "RECEITA_ARRECADADA", idempotencyKey: `receipt-${index}` }));
      const [movement] = await db.select({ id: reconciliationTreasuryMovements.id }).from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.idempotencyKey, `receipt-${index}:TREASURY`));
      assert.ok(movement);
      treasury.push(movement.id);
    }
    const bank: string[] = [];
    for (const [index, value] of ["7.00", "13.00"].entries()) {
      const [item] = await db.insert(bankStatementItems).values({ bankAccountId: "banco", date: new Date("2026-03-10"), description: `Ingresso bancário ${index}`, direction: "Entrada", valueDecimal: new Decimal(value), status: "Pendente" }).returning({ id: bankStatementItems.id });
      bank.push(item.id);
    }
    const session = await openMunicipalReconciliation(f.financeConnection, f.actor, { bankAccountId: "banco", period: "2026-03", openingBalance: opening.toFixed(2) });
    assert.equal((await openMunicipalReconciliation(f.financeConnection, f.actor, { bankAccountId: "banco", period: "2026-03", openingBalance: opening.toFixed(2) })).id, session.id);
    await body(f, session.id, bank, treasury);
  } finally {
    try { await transport?.close(); } finally {
      try { await base?.close(); } finally {
        if (prior === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = prior;
      }
    }
  }
}

for (const entity of ["EXECUTIVE", "LEGISLATIVE"] as const) {
  test(`P3 ${entity}: conciliação N:N/parcial, replay, confirmação, reabertura e desfazimento conservam caixa`, async () => scenario(entity, async (f, sessionId, bank, treasury) => {
    const db = f.financeConnection.db;
    const totals = async () => ({
      revenue: (await db.select({ total: count() }).from(revenues))[0].total,
      posting: (await db.select({ total: count() }).from(accountingTransactions))[0].total,
      treasury: (await db.select({ total: count() }).from(reconciliationTreasuryMovements))[0].total,
    });
    const before = await totals();
    const first = { sessionId, idempotencyKey: "partial-group", reason: "Alocação parcial municipal", allocations: [{ statementItemId: bank[0], treasuryMovementId: treasury[0], amount: "4.00" }] };
    const partial = await allocateBankReconciliation(f.financeConnection, f.actor, first);
    assert.equal((await allocateBankReconciliation(f.financeConnection, f.actor, first)).id, partial.id);
    await assert.rejects(allocateBankReconciliation(f.financeConnection, { ...f.actor, allowedBudgetUnitIds: [] }, first), /autorizadas/i);
    await assert.rejects(allocateBankReconciliation(f.financeConnection, f.actor, { ...first, reason: "Outro fundamento de alocação" }), /outros dados/i);
    await assert.rejects(confirmMunicipalReconciliation(f.financeConnection, f.actor, sessionId), /alocação integral/i);
    let position = await readReconciliationPosition(f.financeConnection.db, f.actor, sessionId);
    assert.equal(position.bank.find((row) => row.id === bank[0])!.remaining.toFixed(2), "3.00");
    assert.equal(position.treasury.find((row) => row.id === treasury[0])!.remaining.toFixed(2), "8.00");
    const finalInput = { sessionId, idempotencyKey: "final-group", reason: "Conclusão do confronto N:N", allocations: [
      { statementItemId: bank[0], treasuryMovementId: treasury[0], amount: "3.00" },
      { statementItemId: bank[1], treasuryMovementId: treasury[0], amount: "5.00" },
      { statementItemId: bank[1], treasuryMovementId: treasury[1], amount: "8.00" },
    ] };
    await f.pg.exec(`CREATE FUNCTION fail_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='RECONCILIATION_ALLOCATE' THEN RAISE EXCEPTION 'injected reconciliation failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_reconciliation BEFORE INSERT ON "FinancialAuditLog" FOR EACH ROW EXECUTE FUNCTION fail_reconciliation();`);
    await assert.rejects(allocateBankReconciliation(f.financeConnection, f.actor, finalInput), error => error instanceof Error && error.cause instanceof Error && /reconciliation failure/i.test(error.cause.message));
    assert.equal((await db.select({ total: count() }).from(bankReconciliationAllocationGroups))[0].total, 1);
    assert.equal((await db.select({ status: bankStatementItems.status }).from(bankStatementItems).where(eq(bankStatementItems.id, bank[0])))[0].status, "Parcial");
    await f.pg.exec('DROP TRIGGER fail_reconciliation ON "FinancialAuditLog"; DROP FUNCTION fail_reconciliation();');
    const final = await allocateBankReconciliation(f.financeConnection, f.actor, finalInput);
    position = await readReconciliationPosition(f.financeConnection.db, f.actor, sessionId);
    assert.equal(position.pending, 0);
    assert.equal(position.difference.toFixed(2), "0.00");
    const auto = await runAutoReconciliation(f.financeConnection, sessionId, f.actor);
    assert.equal(auto.balances.totalCreditos, 20);
    assert.equal(auto.balances.totalItensBanco, 2);
    assert.equal(auto.balances.itensConciliados, 2);
    const receipt = await confirmMunicipalReconciliation(f.financeConnection, f.actor, sessionId);
    assert.equal((await confirmMunicipalReconciliation(f.financeConnection, f.actor, sessionId)).recibo, receipt.recibo);
    assert.equal((await db.select({ total: count() }).from(bankReconciliations))[0].total, 1);
    await assert.rejects(reverseBankReconciliationAllocation(f.financeConnection, f.actor, { groupId: final.id, reason: "Revisão fundamentada das alocações" }), /reabra/i);
    await assert.rejects(runAutoReconciliation(f.financeConnection, sessionId, f.actor), /encerrada/i);
    await reopenMunicipalReconciliation(f.financeConnection, f.actor, { sessionId, reason: "Revisão fundamentada da conciliação" });
    await reverseBankReconciliationAllocation(f.financeConnection, f.actor, { groupId: final.id, reason: "Revisão fundamentada das alocações" });
    assert.equal((await db.select({ status: bankReconciliations.status }).from(bankReconciliations).limit(1))[0].status, "Reaberto");
    assert.equal((await readReconciliationPosition(f.financeConnection.db, f.actor, sessionId)).bank.find((row) => row.id === bank[1])!.remaining.toFixed(2), "13.00");
    await assert.rejects(confirmMunicipalReconciliation(f.financeConnection, f.actor, sessionId), /alocação integral/i);
    await allocateBankReconciliation(f.financeConnection, f.actor, { ...finalInput, idempotencyKey: "final-group-corrected" });
    const next = await confirmMunicipalReconciliation(f.financeConnection, f.actor, sessionId);
    assert.notEqual(next.recibo, receipt.recibo);
    assert.deepEqual(await totals(), before);
  }));
}

test("P3: alocações concorrentes não reutilizam saldo; confirmação exige cobertura dos dois lados", async () => scenario("EXECUTIVE", async (f, sessionId, bank, treasury) => {
  const outcomes = await Promise.allSettled(["one", "two"].map((key) => allocateBankReconciliation(f.financeConnection, f.actor, { sessionId, idempotencyKey: key, reason: "Alocação concorrente fundamentada", allocations: [{ statementItemId: bank[1], treasuryMovementId: treasury[0], amount: "12.00" }] })));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await readReconciliationPosition(f.financeConnection.db, f.actor, sessionId)).bank.find((row) => row.id === bank[1])!.remaining.toFixed(2), "1.00");
  await assert.rejects(matchBankStatementItemToTreasuryMovement(f.financeConnection, f.actor, { statementItemId: bank[1], treasuryMovementId: treasury[0] }), /conciliado|valor|alocações/i);
  const [duplicate] = await f.financeConnection.db.insert(bankStatementItems).values({ bankAccountId: "banco", date: new Date("2026-03-11"), direction: "Entrada", valueDecimal: new Decimal("12.00") }).returning();
  await assert.rejects(matchBankStatementItemToTreasuryMovement(f.financeConnection, f.actor, { statementItemId: duplicate.id, treasuryMovementId: treasury[0] }), /alocações/i);
  await assert.rejects(confirmMunicipalReconciliation(f.financeConnection, f.actor, sessionId), /alocação integral/i);
  const [outside] = await f.financeConnection.db.insert(bankStatementItems).values({ bankAccountId: "banco", date: new Date("2026-04-01"), direction: "Entrada", valueDecimal: new Decimal("1.00") }).returning();
  await assert.rejects(allocateBankReconciliation(f.financeConnection, f.actor, { sessionId, idempotencyKey: "outside-period", reason: "Alocação fora da competência", allocations: [{ statementItemId: outside.id, treasuryMovementId: treasury[1], amount: "1.00" }] }), /período/i);
}));

test("P1/P3: conciliação parcial impede fechamento e alteração do exercício respeita todas as UGs", async () => scenario("EXECUTIVE", async (f, sessionId, bank, treasury) => {
  await allocateBankReconciliation(f.financeConnection, f.actor, { sessionId, idempotencyKey: "partially-reconciled-month", reason: "Conferência parcial antes do fechamento", allocations: [
    { statementItemId: bank[0], treasuryMovementId: treasury[0], amount: "4.00" },
    { statementItemId: bank[1], treasuryMovementId: treasury[0], amount: "5.00" },
    { statementItemId: bank[1], treasuryMovementId: treasury[1], amount: "8.00" },
  ] });
  const db = f.financeConnection.db;
  assert.equal((await db.select({ total: count() }).from(bankStatementItems).where(eq(bankStatementItems.status, "Pendente")))[0].total, 0);
  assert.equal((await accountingPendingChecks(db, "ano", new Date("2026-03-01"))).openReconciliations, 1);
  await assert.rejects(requestAccountingMonthClose(f.financeConnection, { ...f.actor, allowedBudgetUnitIds: undefined }, "ano", new Date("2026-03-01")), /pendencias/i);
  await assert.rejects(setFinancialYearStatus(f.financeConnection, { ...f.actor, allowedBudgetUnitIds: [] }, "ano", "Em Encerramento"), /unidades|UG|autoriz/i);
  assert.equal((await db.select({ status: financialYears.status }).from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Aberto");
}));
