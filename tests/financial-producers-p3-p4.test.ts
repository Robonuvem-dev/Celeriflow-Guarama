import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createRevenue, createTreasuryTransfer, getBankAccountBalance, postAccountingTransaction, requestAccountingMonthClose, authorizeAccountingMonthClose, requestAccountingMonthReopen, authorizeAccountingMonthReopen, prepareAnnualAccountingClose, finalizeAnnualAccountingClose } from "../src/lib/financeiro";
import { recordAssetDisposal } from "../src/lib/patrimonio/asset-lifecycle";

type Fixture = Awaited<ReturnType<typeof createPlanningExecutionFixture>>;
async function scenario(body: (fixture: Fixture) => Promise<void>) {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Fixture | undefined;
  try {
    fixture = await createPlanningExecutionFixture();
    await fixture.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await body(fixture);
  } finally {
    await fixture?.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
}

test("P3: transferência valida saldo, competência, autorização e replay sem duplicar caixa", async () => scenario(async (f) => {
  await f.db.accountingEventCatalog.create({ data: { code: "TRANSFERENCIA_BANCARIA", name: "Transferência", rules: { create: { debitAccountId: "credito", creditAccountId: "debito", isReference: true } } } });
  await f.db.bankAccount.create({ data: { id: "destination", bankName: "Banco destino", agency: "1", accountNumber: "2", accountType: "Corrente", budgetUnitId: "ug", resourceSourceId: "livre", accountingPlanId: "credito", currentBalance: 0, currentBalanceDecimal: 0, isActive: true } });
  await createRevenue(f.db, f.actor, { date: new Date("2026-03-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "TEST", sourceType: "P3_FUNDING", eventType: "RECEIPT", idempotencyKey: "p3-funding" });
  const input = { date: new Date("2026-03-02"), value: "4.00", sourceBankAccountId: "banco", destinationBankAccountId: "destination", idempotencyKey: "transfer-p3" };
  const transfer = await createTreasuryTransfer(f.db, f.actor, input);
  assert.equal((await createTreasuryTransfer(f.db, f.actor, input)).id, transfer.id);
  await assert.rejects(createTreasuryTransfer(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizad/i);
  await assert.rejects(createTreasuryTransfer(f.db, f.actor, { ...input, value: "5.00" }), /outros dados/i);
  await assert.rejects(createTreasuryTransfer(f.db, f.actor, { ...input, value: "7.00", idempotencyKey: "overdraft" }), /insuficiente/i);
  assert.equal((await getBankAccountBalance(f.db, "banco", input.date)).toFixed(2), "6.00");
  assert.equal((await getBankAccountBalance(f.db, "destination", input.date)).toFixed(2), "4.00");
  const posting = await f.db.accountingTransaction.findUniqueOrThrow({ where: { idempotencyKey: "transfer-p3:ACCOUNTING" }, include: { entries: true } });
  assert.equal(posting.budgetUnitId, "ug");
  assert.equal(posting.eventType, "TRANSFERENCIA_BANCARIA");
  assert.deepEqual(posting.entries.map((entry) => [entry.accountId, entry.type, entry.valueDecimal!.toFixed(2)]).sort(), [["credito", "Débito", "4.00"], ["debito", "Crédito", "4.00"]]);
  assert.equal(await f.db.accountingTransaction.count({ where: { idempotencyKey: "transfer-p3:ACCOUNTING" } }), 1);
  await f.db.accountingPostingRule.deleteMany({ where: { event: { code: "TRANSFERENCIA_BANCARIA" } } });
  await assert.rejects(createTreasuryTransfer(f.db, f.actor, { ...input, value: "1.00", idempotencyKey: "missing-rule" }), /regra ativa/i);
  assert.equal((await getBankAccountBalance(f.db, "banco", input.date)).toFixed(2), "6.00");
  assert.equal(await f.db.treasuryMovement.count({ where: { sourceType: "TREASURY_TRANSFER" } }), 2);
  await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano", competence: new Date("2026-04-01"), status: "FECHADO" } });
  await assert.rejects(createTreasuryTransfer(f.db, f.actor, { ...input, date: new Date("2026-04-02"), idempotencyKey: "closed-month" }), /nao esta aberta/i);
  assert.equal(await f.db.treasuryTransfer.count(), 1);
}));

test("P4: alienação usa a cadeia canônica e mês fechado reverte baixa, receita e tesouraria", async () => scenario(async (f) => {
  await f.db.assetCategory.create({ data: { id: "category-p4", name: "Equipamentos de ensaio", code: "P4", lifeSpan: 60 } });
  await f.db.department.create({ data: { id: "asset-department-p4", name: "Patrimônio municipal", secretariatId: "secretaria", isActive: true } });
  for (const id of ["asset-p4", "asset-closed-p4"]) await f.db.asset.create({ data: { id, patrimonyNumber: id, name: id, acquisitionDate: new Date("2026-01-01"), acquisitionValue: 4, currentValue: 4, acquisitionValueDecimal: "4.00", currentValueDecimal: "4.00", budgetUnitId: "ug", departmentId: "asset-department-p4", categoryId: "category-p4", status: "Ativo" } });
  const financial = { budgetUnitId: "ug", bankAccountId: "banco", revenueNatureId: "receita", resourceSourceId: "livre" };
  const input = { assetId: "asset-p4", date: new Date("2026-03-01"), type: "Alienação" as const, reason: "Leilão", justification: "Processo de ensaio", disposalValue: 4, actor: f.actor, financial };
  await assert.rejects(recordAssetDisposal(f.db, { ...input, actor: { ...f.actor, allowedBudgetUnitIds: [] } }), /autorizad/i);
  await assert.rejects(recordAssetDisposal(f.db, { ...input, financial: { budgetUnitId: "ug" } }), /explicitamente/i);
  const result = await recordAssetDisposal(f.db, input);
  const revenue = await f.db.revenue.findUniqueOrThrow({ where: { id: result.alienationRevenueId! } });
  assert.equal(revenue.budgetUnitId, "ug");
  assert.equal(revenue.financialYearId, "ano");
  assert.equal(revenue.sourceId, result.id);
  assert.equal(await f.db.accountingTransaction.count({ where: { sourceModule: "PATRIMONIO", sourceType: "ASSET_ALIENATION" } }), 1);
  assert.equal((await getBankAccountBalance(f.db, "banco", input.date)).toFixed(2), "4.00");
  await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano", competence: new Date("2026-04-01"), status: "FECHADO" } });
  await assert.rejects(recordAssetDisposal(f.db, { ...input, assetId: "asset-closed-p4", date: new Date("2026-04-02") }), /nao esta aberta/i);
  assert.equal((await f.db.asset.findUniqueOrThrow({ where: { id: "asset-closed-p4" } })).status, "Ativo");
  assert.equal(await f.db.assetWriteOff.count(), 1);
  assert.equal(await f.db.revenue.count(), 1);
  assert.equal(await f.db.treasuryMovement.count(), 1);
}));

test("P3: transferência entre UGs tem pernas contábeis próprias e falha na segunda reverte toda a cadeia", async () => scenario(async (f) => {
  await f.db.budgetUnit.create({ data: { id: "ug-destination", code: "UG2", name: "Unidade de destino", secretariatId: "secretaria", planningEntityUnit: { create: { governmentEntityId: "ente" } } } });
  await f.db.accountingPlan.create({ data: { id: "clearing", code: "1.1.9.99", name: "Trânsito entre unidades", type: "Ativo" } });
  await f.db.bankAccount.create({ data: { id: "destination", bankName: "Destino", agency: "1", accountNumber: "2", accountType: "Corrente", budgetUnitId: "ug-destination", resourceSourceId: "livre", accountingPlanId: "credito", currentBalance: 0, currentBalanceDecimal: 0, isActive: true } });
  await f.db.accountingEventCatalog.create({ data: { code: "TRANSFERENCIA_UG_SAIDA", name: "Saída UG", rules: { create: { debitAccountId: "clearing", creditAccountId: "debito", isReference: true } } } });
  await createRevenue(f.db, f.actor, { date: new Date("2026-03-01"), value: "10.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "TEST", sourceType: "UG_FUNDING", eventType: "RECEIPT", idempotencyKey: "ug-funding" });
  const input = { date: new Date("2026-03-02"), value: "4.00", sourceBankAccountId: "banco", destinationBankAccountId: "destination", idempotencyKey: "ug-transfer" };
  const actor = { ...f.actor, allowedBudgetUnitIds: ["ug", "ug-destination"] };
  await assert.rejects(createTreasuryTransfer(f.db, f.actor, input), /autorizad/i);
  await assert.rejects(createTreasuryTransfer(f.db, actor, input), /regra ativa/i);
  assert.equal(await f.db.treasuryTransfer.count(), 0);
  assert.equal(await f.db.accountingTransaction.count({ where: { sourceType: "TREASURY_TRANSFER" } }), 0);
  assert.equal((await getBankAccountBalance(f.db, "banco", input.date)).toFixed(2), "10.00");
  await f.db.accountingEventCatalog.create({ data: { code: "TRANSFERENCIA_UG_ENTRADA", name: "Entrada UG", rules: { create: { debitAccountId: "credito", creditAccountId: "clearing", isReference: true } } } });
  await createTreasuryTransfer(f.db, actor, input);
  await createTreasuryTransfer(f.db, actor, input);
  const postings = await f.db.accountingTransaction.findMany({ where: { sourceType: "TREASURY_TRANSFER" }, include: { entries: true }, orderBy: { budgetUnitId: "asc" } });
  assert.deepEqual(postings.map((p) => p.budgetUnitId), ["ug", "ug-destination"]);
  assert.deepEqual(postings.map((p) => p.entries.map((e) => [e.accountId, e.type, e.valueDecimal!.toFixed(2)]).sort()), [
    [["clearing", "Débito", "4.00"], ["debito", "Crédito", "4.00"]],
    [["clearing", "Crédito", "4.00"], ["credito", "Débito", "4.00"]],
  ]);
  assert.equal((await getBankAccountBalance(f.db, "banco", input.date)).toFixed(2), "6.00");
  assert.equal((await getBankAccountBalance(f.db, "destination", input.date)).toFixed(2), "4.00");
}));

test("P1: contas de matriz de ensaio são recusadas fora do modo POC", async () => scenario(async (f) => {
  await f.db.planningCatalogVersion.create({ data: { id: "poc-p1", year: 2026, label: "POC", sourceHash: "poc-test", normativeReference: "Ensaio autorizado", createdById: "ana", entries: { create: { kind: "ACCOUNT", code: "1.1.1.1.1.19.00.00.00.00.00.00", name: "Ensaio", degree: 6, canonicalId: "debito", attributes: { pocOnly: true, postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } } } } });
  await f.db.planningCatalogVersion.update({ where: { id: "poc-p1" }, data: { status: "PUBLISHED" } });
  delete process.env.CELERIFLOW_ACCOUNTING_MODE;
  await assert.rejects(postAccountingTransaction(f.db, f.actor, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Tentativa fora do modo de ensaio", lines: [{ accountId: "debito", type: "Débito", value: "1.00" }, { accountId: "credito", type: "Crédito", value: "1.00" }] }), /somente no modo POC/i);
}));

test("P1/P3: fechamento por entidade recusa operador autorizado somente para parte das UGs", async () => scenario(async (f) => {
  await f.db.budgetUnit.create({ data: { id: "ug-restricted", code: "UG-RESTRICTED", name: "UG fora do perfil", secretariatId: "secretaria", planningEntityUnit: { create: { governmentEntityId: "ente" } } } });
  const month = new Date("2026-03-01");
  for (const command of [
    () => requestAccountingMonthClose(f.db, f.actor, "ano", month),
    () => authorizeAccountingMonthClose(f.db, f.actor, "ano", month),
    () => requestAccountingMonthReopen(f.db, f.actor, "ano", month, "Ensaio autorizado"),
    () => authorizeAccountingMonthReopen(f.db, f.actor, "ano", month),
    () => prepareAnnualAccountingClose(f.db, f.actor, "ano"),
    () => finalizeAnnualAccountingClose(f.db, f.actor, "ano"),
  ]) await assert.rejects(command(), /todas as UGs/i);
  assert.equal(await f.db.monthlyAccountingClose.count(), 0);
  assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Aberto");
}));

test("P1: classificação publicada recusa conta sintética mesmo sem filhos locais", async () => scenario(async (f) => {
  await f.db.planningCatalogVersion.create({ data: { id: "official-p1", year: 2026, label: "Classificação de ensaio", sourceHash: "p1-test", normativeReference: "Metadados explícitos", createdById: "ana", entries: { create: { kind: "ACCOUNT", code: "1.1.1.1.1.01.00.00.00.00.00.00", name: "Conta não escriturável", degree: 6, canonicalId: "debito", attributes: { postingAllowed: false, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } } } } });
  await f.db.planningCatalogVersion.update({ where: { id: "official-p1" }, data: { status: "PUBLISHED" } });
  const input = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Tentativa em conta sintética", lines: [{ accountId: "debito", type: "Débito" as const, value: "2.00" }, { accountId: "credito", type: "Crédito" as const, value: "2.00" }] };
  await assert.rejects(postAccountingTransaction(f.db, f.actor, input), /sintética/i);
  assert.equal(await f.db.accountingTransaction.count({ where: { history: input.history } }), 0);
}));
