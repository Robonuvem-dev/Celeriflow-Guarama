import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray, or } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { createFinanceLegacyStoriesFixture } from "../../../../tests/helpers/finance-legacy-stories-fixture";
import { users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import { planningResourceSources, planningRevenueNatures } from "@/db/schema/planning-legal";
import { accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions } from "@/db/schema/finance-accounting";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "@/db/schema/finance-reconciliation";
import { revenues, revenueRedistributions, revenueReversals } from "@/db/schema/finance-revenues";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { collectLaunchedRevenue, createRevenue, launchRevenue, redistributeRevenueResourceSource, reverseRevenue, type FinanceActor } from "../index";
import { pocVirtualBank } from "@/lib/poc/poc-config";

let fixture: Awaited<ReturnType<typeof createFinanceLegacyStoriesFixture>> | undefined;
let db: DatabaseExecutor;
let databaseConnection: DatabaseConnection;

before(async () => {
  fixture = await createFinanceLegacyStoriesFixture();
  databaseConnection = fixture.connection;
  db = fixture.connection.db;
});
after(async () => { await fixture?.close(); });

test("revenue lifecycle keeps launch, collection, source redistribution and reversal auditable", async () => {
  const [[actorUser], [actorEmployee]] = await Promise.all([
    db.select({ id: users.id, employeeId: users.employeeId }).from(users).limit(1),
    db.select({ id: employees.id }).from(employees).limit(1),
  ]);
  const actor: FinanceActor = { usuarioId: actorUser?.id ?? "usr-admin-lagoaseca", employeeId: actorUser?.employeeId ?? actorEmployee?.id ?? "emp-servidor-lagoaseca" };
  const [[nature], [source], [destination], [account]] = await Promise.all([
    db.select({ id: planningRevenueNatures.id }).from(planningRevenueNatures).limit(1),
    db.select({ id: planningResourceSources.id }).from(planningResourceSources).where(eq(planningResourceSources.code, "15000000")),
    db.select({ id: planningResourceSources.id }).from(planningResourceSources).where(eq(planningResourceSources.code, "15010000")),
    db.select({ id: reconciliationBankAccounts.id }).from(reconciliationBankAccounts).innerJoin(planningResourceSources, eq(planningResourceSources.id, reconciliationBankAccounts.resourceSourceId)).where(and(eq(reconciliationBankAccounts.bankName, pocVirtualBank.name), eq(reconciliationBankAccounts.accountNumber, "20001-1"), eq(planningResourceSources.code, "15000000"), eq(reconciliationBankAccounts.isActive, true))).limit(1),
  ]);
  assert.ok(nature && source && destination && account, "A seed POC deve fornecer natureza, fontes e conta bancaria para o ciclo de receita.");
  const selectedPlans = await db.select({ id: accountingPlans.id }).from(accountingPlans).limit(2);
  assert.equal(selectedPlans.length, 2, "A seed POC deve fornecer duas contas contabeis para os eventos de receita.");
  for (const [code, name] of [["RECEITA_LANCADA", "Receita lancada"], ["RECEITA_ARRECADADA", "Receita arrecadada"], ["RECEITA_ESTORNADA", "Receita estornada"], ["RECEITA_REDISTRIBUIDA_FONTE", "Receita redistribuida por fonte"]] as const) {
    const [event] = await db.insert(accountingEvents).values({ code, name }).onConflictDoUpdate({ target: accountingEvents.code, set: { name, isActive: true } }).returning();
    await db.update(accountingRules).set({ isActive: false }).where(eq(accountingRules.eventId, event.id));
    await db.insert(accountingRules).values({ eventId: event.id, debitAccountId: selectedPlans[0].id, creditAccountId: selectedPlans[1].id, isReference: true }).onConflictDoUpdate({ target: [accountingRules.eventId, accountingRules.debitAccountId, accountingRules.creditAccountId], set: { isActive: true, isReference: true } });
  }

  const timestamp = Date.now().toString();
  const date = new Date("2026-08-15T12:00:00.000Z");
  const previousAccountingMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const revenueIds: string[] = [];
  const transactionSourceIds: string[] = [];

  try {
    const launched = await launchRevenue(databaseConnection, actor, {
      budgetUnitId: "budget-unit-fin-01",
      date,
      value: "100.00",
      revenueNatureId: nature.id,
      resourceSourceId: source.id,
      classification: "INTRAORCAMENTARIA",
      history: `Receita lancada de teste ${timestamp}`,
      sourceModule: "TEST",
      sourceType: "REVENUE_LIFECYCLE",
      eventType: "TEST_REVENUE_LAUNCHED",
      idempotencyKey: `TEST:REVENUE:${timestamp}:LAUNCH`,
    });
    revenueIds.push(launched.id);
    transactionSourceIds.push(launched.id);
    assert.equal(launched.stage, "LANCADA");
    assert.equal(launched.classification, "INTRAORCAMENTARIA");

    const collected = await collectLaunchedRevenue(databaseConnection, actor, {
      revenueId: launched.id,
      date,
      bankAccountId: account.id,
      idempotencyKey: `TEST:REVENUE:${timestamp}:COLLECT`,
    });
    assert.equal(collected.stage, "ARRECADADA");
    assert.ok(collected.treasuryMovement);

    const redistribution = await redistributeRevenueResourceSource(databaseConnection, actor, {
      revenueId: launched.id,
      date,
      value: "40.00",
      destinationResourceSourceId: destination.id,
      history: "Redistribuicao interna de teste",
      idempotencyKey: `TEST:REVENUE:${timestamp}:REDISTRIBUTION`,
    });
    transactionSourceIds.push(redistribution.id);
    assert.equal(redistribution.sourceResourceSourceId, source.id);
    assert.equal(redistribution.destinationResourceSourceId, destination.id);
    await assert.rejects(() => reverseRevenue(databaseConnection, actor, { revenueId: launched.id, date, justification: "Nao deve estornar com redistribuicao ativa" }), /redistribuicoes por fonte/i);

    const collectedDirectly = await createRevenue(databaseConnection, actor, {
      date,
      value: "60.00",
      revenueNatureId: nature.id,
      resourceSourceId: source.id,
      bankAccountId: account.id,
      classification: "REDUTORA",
      history: `Receita redutora de teste ${timestamp}`,
      sourceModule: "TEST",
      sourceType: "REVENUE_LIFECYCLE",
      eventType: "TEST_REVENUE_COLLECTED",
      idempotencyKey: `TEST:REVENUE:${timestamp}:DIRECT`,
    });
    revenueIds.push(collectedDirectly.id);
    transactionSourceIds.push(collectedDirectly.id);
    const reversal = await reverseRevenue(databaseConnection, actor, { revenueId: collectedDirectly.id, date, justification: "Estorno interno de teste" });
    transactionSourceIds.push(reversal.id);
    const [reversed] = await db.select({ revenue: revenues, reversal: revenueReversals, treasuryMovement: reconciliationTreasuryMovements }).from(revenues).leftJoin(revenueReversals, eq(revenueReversals.revenueId, revenues.id)).leftJoin(reconciliationTreasuryMovements, eq(reconciliationTreasuryMovements.id, revenueReversals.treasuryMovementId)).where(eq(revenues.id, collectedDirectly.id));
    assert.ok(reversed);
    assert.equal(reversed.revenue.stage, "ESTORNADA");
    assert.equal(reversed.reversal?.id, reversal.id);
    assert.equal(reversed.treasuryMovement?.direction, "Saída");
    const [audit] = await db.select({ id: financialAuditLogs.id }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "REVERSE"), eq(financialAuditLogs.entityType, "Revenue"), eq(financialAuditLogs.entityId, collectedDirectly.id))).limit(1);
    assert.ok(audit, "O estorno deve manter evidencia de auditoria da receita de origem.");
  } finally {
    const redistributions = await db.select({ id: revenueRedistributions.id }).from(revenueRedistributions).where(inArray(revenueRedistributions.revenueId, revenueIds));
    const reversals = await db.select({ id: revenueReversals.id, treasuryMovementId: revenueReversals.treasuryMovementId }).from(revenueReversals).where(inArray(revenueReversals.revenueId, revenueIds));
    const transactions = await db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(inArray(accountingTransactions.sourceId, [...transactionSourceIds, ...revenueIds]));
    if (transactions.length) await db.delete(accountingEntries).where(inArray(accountingEntries.transactionId, transactions.map(item => item.id)));
    if (transactions.length) await db.delete(accountingTransactions).where(inArray(accountingTransactions.id, transactions.map(item => item.id)));
    // Financial audit evidence is append-only by policy and intentionally remains after fixture cleanup.
    if (redistributions.length) await db.delete(revenueRedistributions).where(inArray(revenueRedistributions.id, redistributions.map(item => item.id)));
    if (reversals.length) await db.delete(revenueReversals).where(inArray(revenueReversals.id, reversals.map(item => item.id)));
    const movements = await db.select({ id: reconciliationTreasuryMovements.id }).from(reconciliationTreasuryMovements).where(or(inArray(reconciliationTreasuryMovements.revenueId, revenueIds), inArray(reconciliationTreasuryMovements.id, reversals.map(item => item.treasuryMovementId))));
    if (movements.length) await db.delete(reconciliationTreasuryMovements).where(inArray(reconciliationTreasuryMovements.id, movements.map(item => item.id)));
    if (revenueIds.length) await db.delete(revenues).where(inArray(revenues.id, revenueIds));
    if (previousAccountingMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousAccountingMode;
  }
});
