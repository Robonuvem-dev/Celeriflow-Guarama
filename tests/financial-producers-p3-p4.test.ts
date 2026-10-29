import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import { accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialYears } from "../src/db/schema/finance-years";
import { revenues, treasuryTransfers } from "../src/db/schema/finance-revenues";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { assetCategories, assets, assetWriteOffs } from "../src/db/schema/assets";
import { departments } from "../src/db/schema/administration";
import { planningBudgetUnits, planningEntityUnits } from "../src/db/schema/planning-budget";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-legal";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createRevenue, createTreasuryTransfer, getBankAccountBalance, postAccountingTransaction, requestAccountingMonthClose, authorizeAccountingMonthClose, requestAccountingMonthReopen, authorizeAccountingMonthReopen, prepareAnnualAccountingClose, finalizeAnnualAccountingClose } from "../src/lib/financeiro";
import { recordAssetDisposal } from "../src/lib/patrimonio/asset-lifecycle";

type Fixture = Awaited<ReturnType<typeof createPlanningExecutionFixture>>;
async function scenario(body: (fixture: Fixture, connection: DatabaseConnection) => Promise<void>) {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Fixture | undefined;
  try {
    fixture = await createPlanningExecutionFixture();
    await fixture.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await body(fixture, fixture.connection);
  } finally {
    try { await fixture?.close(); } finally {
      if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
      else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
    }
  }
}

test("P3: transferência valida saldo, competência, autorização e replay sem duplicar caixa", async () => scenario(async (f, connection) => {
  const db = connection.db;
  const [event] = await db.transaction(async tx => {
    const [event] = await tx.insert(accountingEvents).values({ code: "TRANSFERENCIA_BANCARIA", name: "Transferência" }).returning();
    await tx.insert(accountingRules).values({ eventId: event.id, debitAccountId: "credito", creditAccountId: "debito", isReference: true });
    return [event];
  });
  await db.insert(reconciliationBankAccounts).values({ id: "destination", bankName: "Banco destino", agency: "1", accountNumber: "2", accountType: "Corrente", budgetUnitId: "ug", resourceSourceId: "livre", accountingPlanId: "credito", currentBalance: 0, currentBalanceDecimal: new Decimal(0), isActive: true });
  await createRevenue(connection, f.actor, { date: new Date("2026-03-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "TEST", sourceType: "P3_FUNDING", eventType: "RECEIPT", idempotencyKey: "p3-funding" });
  const input = { date: new Date("2026-03-02"), value: "4.00", sourceBankAccountId: "banco", destinationBankAccountId: "destination", idempotencyKey: "transfer-p3" };
  const transfer = await createTreasuryTransfer(connection, f.actor, input);
  assert.equal((await createTreasuryTransfer(connection, f.actor, input)).id, transfer.id);
  await assert.rejects(createTreasuryTransfer(connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizad/i);
  await assert.rejects(createTreasuryTransfer(connection, f.actor, { ...input, value: "5.00" }), /outros dados/i);
  await assert.rejects(createTreasuryTransfer(connection, f.actor, { ...input, value: "7.00", idempotencyKey: "overdraft" }), /insuficiente/i);
  assert.equal((await getBankAccountBalance(db, "banco", input.date)).toFixed(2), "6.00");
  assert.equal((await getBankAccountBalance(db, "destination", input.date)).toFixed(2), "4.00");
  const [posting] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, "transfer-p3:ACCOUNTING"));
  assert.ok(posting);
  const entries = await db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, posting.id));
  assert.equal(posting.budgetUnitId, "ug");
  assert.equal(posting.eventType, "TRANSFERENCIA_BANCARIA");
  assert.deepEqual(entries.map((entry) => [entry.accountId, entry.type, entry.valueDecimal!.toFixed(2)]).sort(), [["credito", "Débito", "4.00"], ["debito", "Crédito", "4.00"]]);
  assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, "transfer-p3:ACCOUNTING")))[0].total, 1);
  await db.delete(accountingRules).where(eq(accountingRules.eventId, event.id));
  await assert.rejects(createTreasuryTransfer(connection, f.actor, { ...input, value: "1.00", idempotencyKey: "missing-rule" }), /regra ativa/i);
  assert.equal((await getBankAccountBalance(db, "banco", input.date)).toFixed(2), "6.00");
  assert.equal((await db.select({ total: count() }).from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.sourceType, "TREASURY_TRANSFER")))[0].total, 2);
  await db.insert(monthlyAccountingCloses).values({ financialYearId: "ano", competence: new Date("2026-04-01"), status: "FECHADO" });
  await assert.rejects(createTreasuryTransfer(connection, f.actor, { ...input, date: new Date("2026-04-02"), idempotencyKey: "closed-month" }), /nao esta aberta/i);
  assert.equal((await db.select({ total: count() }).from(treasuryTransfers))[0].total, 1);
}));

test("P4: alienação usa a cadeia canônica e mês fechado reverte baixa, receita e tesouraria", async () => scenario(async (f, connection) => {
  const db = connection.db;
  await db.insert(assetCategories).values({ id: "category-p4", name: "Equipamentos de ensaio", code: "P4", lifeSpan: 60 });
  await db.insert(departments).values({ id: "asset-department-p4", name: "Patrimônio municipal", secretariatId: "secretaria", isActive: true });
  for (const id of ["asset-p4", "asset-closed-p4"]) await db.insert(assets).values({ id, patrimonyNumber: id, name: id, acquisitionDate: new Date("2026-01-01"), acquisitionValue: 4, currentValue: 4, acquisitionValueDecimal: new Decimal("4.00"), currentValueDecimal: new Decimal("4.00"), budgetUnitId: "ug", departmentId: "asset-department-p4", categoryId: "category-p4", status: "Ativo" });
  const financial = { budgetUnitId: "ug", bankAccountId: "banco", revenueNatureId: "receita", resourceSourceId: "livre" };
  const input = { assetId: "asset-p4", date: new Date("2026-03-01"), type: "Alienação" as const, reason: "Leilão", justification: "Processo de ensaio", disposalValue: 4, actor: f.actor, financial };
  await assert.rejects(recordAssetDisposal(connection, { ...input, actor: { ...f.actor, allowedBudgetUnitIds: [] } }), /autorizad/i);
  await assert.rejects(recordAssetDisposal(connection, { ...input, financial: { budgetUnitId: "ug" } }), /explicitamente/i);
  const result = await recordAssetDisposal(connection, input);
  const [revenue] = await db.select().from(revenues).where(eq(revenues.id, result.alienationRevenueId!));
  assert.ok(revenue);
  assert.equal(revenue.budgetUnitId, "ug");
  assert.equal(revenue.financialYearId, "ano");
  assert.equal(revenue.sourceId, result.id);
  assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(and(eq(accountingTransactions.sourceModule, "PATRIMONIO"), eq(accountingTransactions.sourceType, "ASSET_ALIENATION"))))[0].total, 1);
  assert.equal((await getBankAccountBalance(db, "banco", input.date)).toFixed(2), "4.00");
  await db.insert(monthlyAccountingCloses).values({ financialYearId: "ano", competence: new Date("2026-04-01"), status: "FECHADO" });
  await assert.rejects(recordAssetDisposal(connection, { ...input, assetId: "asset-closed-p4", date: new Date("2026-04-02") }), /nao esta aberta/i);
  assert.equal((await db.select().from(assets).where(eq(assets.id, "asset-closed-p4")))[0].status, "Ativo");
  assert.equal((await db.select({ total: count() }).from(assetWriteOffs))[0].total, 1);
  assert.equal((await db.select({ total: count() }).from(revenues))[0].total, 1);
  assert.equal((await db.select({ total: count() }).from(reconciliationTreasuryMovements))[0].total, 1);
}));

test("P3: transferência entre UGs tem pernas contábeis próprias e falha na segunda reverte toda a cadeia", async () => scenario(async (f, connection) => {
  const db = connection.db;
  await db.transaction(async tx => {
    await tx.insert(planningBudgetUnits).values({ id: "ug-destination", code: "UG2", name: "Unidade de destino", secretariatId: "secretaria" });
    await tx.insert(planningEntityUnits).values({ governmentEntityId: "ente", budgetUnitId: "ug-destination" });
  });
  await db.insert(accountingPlans).values({ id: "clearing", code: "1.1.9.99", name: "Trânsito entre unidades", type: "Ativo" });
  await db.insert(reconciliationBankAccounts).values({ id: "destination", bankName: "Destino", agency: "1", accountNumber: "2", accountType: "Corrente", budgetUnitId: "ug-destination", resourceSourceId: "livre", accountingPlanId: "credito", currentBalance: 0, currentBalanceDecimal: new Decimal(0), isActive: true });
  await db.transaction(async tx => {
    const [event] = await tx.insert(accountingEvents).values({ code: "TRANSFERENCIA_UG_SAIDA", name: "Saída UG" }).returning();
    await tx.insert(accountingRules).values({ eventId: event.id, debitAccountId: "clearing", creditAccountId: "debito", isReference: true });
  });
  await createRevenue(connection, f.actor, { date: new Date("2026-03-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "TEST", sourceType: "UG_FUNDING", eventType: "RECEIPT", idempotencyKey: "ug-funding" });
  const input = { date: new Date("2026-03-02"), value: "4.00", sourceBankAccountId: "banco", destinationBankAccountId: "destination", idempotencyKey: "ug-transfer" };
  const actor = { ...f.actor, allowedBudgetUnitIds: ["ug", "ug-destination"] };
  await assert.rejects(createTreasuryTransfer(connection, f.actor, input), /autorizad/i);
  await assert.rejects(createTreasuryTransfer(connection, actor, input), /regra ativa/i);
  assert.equal((await db.select({ total: count() }).from(treasuryTransfers))[0].total, 0);
  assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceType, "TREASURY_TRANSFER")))[0].total, 0);
  assert.equal((await getBankAccountBalance(db, "banco", input.date)).toFixed(2), "10.00");
  await db.transaction(async tx => {
    const [event] = await tx.insert(accountingEvents).values({ code: "TRANSFERENCIA_UG_ENTRADA", name: "Entrada UG" }).returning();
    await tx.insert(accountingRules).values({ eventId: event.id, debitAccountId: "credito", creditAccountId: "clearing", isReference: true });
  });
  await createTreasuryTransfer(connection, actor, input);
  await createTreasuryTransfer(connection, actor, input);
  const journals = await db.select().from(accountingTransactions).where(eq(accountingTransactions.sourceType, "TREASURY_TRANSFER")).orderBy(asc(accountingTransactions.budgetUnitId));
  const entries = journals.length ? await db.select().from(accountingEntries).where(inArray(accountingEntries.transactionId, journals.map(row => row.id))) : [];
  const postings = journals.map(journal => ({ ...journal, entries: entries.filter(row => row.transactionId === journal.id) }));
  assert.deepEqual(postings.map((p) => p.budgetUnitId), ["ug", "ug-destination"]);
  assert.deepEqual(postings.map((p) => p.entries.map((e) => [e.accountId, e.type, e.valueDecimal!.toFixed(2)]).sort()), [
    [["clearing", "Débito", "4.00"], ["debito", "Crédito", "4.00"]],
    [["clearing", "Crédito", "4.00"], ["credito", "Débito", "4.00"]],
  ]);
  assert.equal((await getBankAccountBalance(db, "banco", input.date)).toFixed(2), "6.00");
  assert.equal((await getBankAccountBalance(db, "destination", input.date)).toFixed(2), "4.00");
}));

test("P1: contas de matriz de ensaio são recusadas fora do modo POC", async () => scenario(async (f, connection) => {
  const db = connection.db;
  await db.transaction(async tx => {
    await tx.insert(planningCatalogVersions).values({ id: "poc-p1", year: 2026, label: "POC", sourceHash: "poc-test", normativeReference: "Ensaio autorizado", createdById: "ana" });
    await tx.insert(planningCatalogEntries).values({ versionId: "poc-p1", kind: "ACCOUNT", code: "1.1.1.1.1.19.00.00.00.00.00.00", name: "Ensaio", degree: 6, canonicalId: "debito", attributes: { pocOnly: true, postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } });
  });
  await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "poc-p1"));
  delete process.env.CELERIFLOW_ACCOUNTING_MODE;
  await assert.rejects(postAccountingTransaction(connection, f.actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Tentativa fora do modo de ensaio", lines: [{ accountId: "debito", type: "Débito", value: "1.00" }, { accountId: "credito", type: "Crédito", value: "1.00" }] }), /somente no modo POC/i);
}));

test("P1/P3: fechamento por entidade recusa operador autorizado somente para parte das UGs", async () => scenario(async (f, connection) => {
  const db = connection.db;
  await db.transaction(async tx => {
    await tx.insert(planningBudgetUnits).values({ id: "ug-restricted", code: "UG-RESTRICTED", name: "UG fora do perfil", secretariatId: "secretaria" });
    await tx.insert(planningEntityUnits).values({ governmentEntityId: "ente", budgetUnitId: "ug-restricted" });
  });
  const month = new Date("2026-03-01");
  for (const command of [
    () => requestAccountingMonthClose(connection, f.actor, "ano", month),
    () => authorizeAccountingMonthClose(connection, f.actor, "ano", month),
    () => requestAccountingMonthReopen(connection, f.actor, "ano", month, "Ensaio autorizado"),
    () => authorizeAccountingMonthReopen(connection, f.actor, "ano", month),
    () => prepareAnnualAccountingClose(connection, f.actor, "ano"),
    () => finalizeAnnualAccountingClose(connection, f.actor, "ano"),
  ]) await assert.rejects(command(), /todas as UGs/i);
  assert.equal((await db.select({ total: count() }).from(monthlyAccountingCloses))[0].total, 0);
  assert.equal((await db.select().from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Aberto");
}));

test("P1: classificação publicada recusa conta sintética mesmo sem filhos locais", async () => scenario(async (f, connection) => {
  const db = connection.db;
  await db.transaction(async tx => {
    await tx.insert(planningCatalogVersions).values({ id: "official-p1", year: 2026, label: "Classificação de ensaio", sourceHash: "p1-test", normativeReference: "Metadados explícitos", createdById: "ana" });
    await tx.insert(planningCatalogEntries).values({ versionId: "official-p1", kind: "ACCOUNT", code: "1.1.1.1.1.01.00.00.00.00.00.00", name: "Conta não escriturável", degree: 6, canonicalId: "debito", attributes: { postingAllowed: false, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } });
  });
  await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "official-p1"));
  const input = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Tentativa em conta sintética", lines: [{ accountId: "debito", type: "Débito" as const, value: "2.00" }, { accountId: "credito", type: "Crédito" as const, value: "2.00" }] };
  await assert.rejects(postAccountingTransaction(connection, f.actor, input), /sintética/i);
  assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.history, input.history)))[0].total, 0);
}));
