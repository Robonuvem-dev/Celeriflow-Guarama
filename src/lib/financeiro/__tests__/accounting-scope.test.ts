import { test } from "node:test";
import assert from "node:assert/strict";
import { count, eq } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { accountingEntries, accountingPlans, accountingTransactions, annualAccountingCloses, monthlyAccountingCloses } from "@/db/schema/finance-accounting";
import { reconciliationBankAccounts, reconciliationTreasuryMovements, bankReconciliations } from "@/db/schema/finance-reconciliation";
import { bankStatementItems } from "@/db/schema/finance-banking";
import { financialYears } from "@/db/schema/finance-years";
import { governmentEntities } from "@/db/schema/master-data";
import { planningBudgetUnits, planningEntityUnits } from "@/db/schema/planning-budget";
import { createPlanningAccountingFixture } from "../../../../tests/helpers/planning-accounting-fixture";
import { authorizeAccountingMonthClose, authorizeAccountingMonthReopen, finalizeAnnualAccountingClose, postAccountingTransaction, prepareAnnualAccountingClose, requestAccountingMonthClose, requestAccountingMonthReopen } from "../index";
import { generateBalanceteContabil, generateDiarioContabil, generateRazaoContabil } from "../relatorios-legais";
import { generateInternalReportDataset } from "../report-delivery";
import { resolveFinancialReportScope } from "../report-scope";
import { connectFinanceDrizzleFixture } from "../../../../tests/helpers/finance-drizzle-connection";

test("contabilidade filtra Diario, Razao e Balancete pela entidade e UG sem misturar movimentos", async () => {
  const fixture = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(fixture.pg);
    const { connection } = transport;
    const db = connection.db;
    await fixture.rules();
    const date = new Date("2026-04-15T12:00:00.000Z");
    const posted = await postAccountingTransaction(connection, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01T00:00:00.000Z"),
      history: "Abertura contábil com escopo", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE",
      idempotencyKey: "scope:posted:opening", lines: [{ accountId: "debito", type: "Débito", value: "5.00" }, { accountId: "credito", type: "Crédito", value: "5.00" }],
    });
    assert.equal(posted.governmentEntityId, "ente");
    assert.equal(posted.budgetUnitId, "ug");
    await db.insert(reconciliationBankAccounts).values({ id: "canonical-restricted-bank", bankName: "Origem fora da UG", agency: "0001", accountNumber: "canonical-restricted", budgetUnitId: "ug-restrita" });
    await assert.rejects(postAccountingTransaction(connection, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01"), history: "Escopo explícito divergente da origem", sourceModule: "PLANEJAMENTO", sourceType: "BANK_ACCOUNT_OPENING_BALANCE", sourceId: "canonical-restricted-bank", eventType: "PLANNING_BUDGET_OPENING_EXPENSE", lines: [{ accountId: "debito", type: "Débito", value: "5.00" }, { accountId: "credito", type: "Crédito", value: "5.00" }],
    }), /unidade gestora informada diverge da origem/i);
    await assert.rejects(postAccountingTransaction(connection, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01T00:00:00.000Z"), history: "Abertura contábil com escopo", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE", idempotencyKey: "scope:posted:opening", lines: [{ accountId: "debito", type: "Débito", value: "7.00" }, { accountId: "credito", type: "Crédito", value: "7.00" }],
    }), /chave contábil.*outros dados/i);
    await db.insert(accountingPlans).values({ id: "sintetica", code: "ISOLATED", name: "Conta sintética de ensaio", type: "Ativo" });
    await assert.rejects(postAccountingTransaction(connection, { usuarioId: "ana", employeeId: "servidora-ana" }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01"), history: "Conta sintética inválida", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE", lines: [{ accountId: "sintetica", type: "Débito", value: "1.00" }, { accountId: "credito", type: "Crédito", value: "1.00" }],
    }), /conta sintética/i);
    await assert.rejects(postAccountingTransaction(connection, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug-restrita", date: new Date("2026-01-01T00:00:00.000Z"),
      history: "Unidade fora do perfil", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE",
      idempotencyKey: "scope:posted:denied", lines: [{ accountId: "debito", type: "Débito", value: "6.00" }, { accountId: "credito", type: "Crédito", value: "6.00" }],
    }));
    for (const [index, budgetUnitId, value] of [[1, "ug", "125.00"], [2, "ug-restrita", "40.00"]] as const) {
      await db.transaction(async tx => {
        await tx.insert(accountingTransactions).values({
          id: `scoped-transaction-${index}`,
          governmentEntityId: "ente",
          budgetUnitId,
          financialYearId: "ano",
          date,
          history: `Escopo de teste ${index}`,
          status: "POSTADO",
          authorUsuarioId: "ana",
          authorEmployeeId: "servidora-ana",
          postedAt: date,
          sourceModule: "FINANCEIRO",
          sourceType: "TEST_SCOPE",
          sourceId: `scope-${index}`,
          eventType: "TEST_SCOPE",
          idempotencyKey: `scope:${index}`,
        });
        await tx.insert(accountingEntries).values([
          { id: `scoped-debit-${index}`, transactionId: `scoped-transaction-${index}`, date, value: Number(value), valueDecimal: new Decimal(value), type: "Débito", history: "Teste de escopo", accountId: "debito", authorId: "servidora-ana" },
          { id: `scoped-credit-${index}`, transactionId: `scoped-transaction-${index}`, date, value: Number(value), valueDecimal: new Decimal(value), type: "Crédito", history: "Teste de escopo", accountId: "credito", authorId: "servidora-ana" },
        ]);
      });
    }

    const municipality = await generateDiarioContabil(db, { financialYearId: "ano", governmentEntityId: "ente" });
    const unit = await generateDiarioContabil(db, { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug" });
    assert.equal(municipality.length, 3);
    assert.equal(unit.length, 2);
    assert.equal(unit.some((transaction) => transaction.history === "Escopo de teste 1"), true);
    assert.deepEqual(await generateDiarioContabil(db, { financialYearId: "ano", budgetUnitId: "ug-restrita", budgetUnitIds: ["ug"] }), []);

    const ledger = await generateRazaoContabil(db, { financialYearId: "ano", budgetUnitId: "ug-restrita", accountId: "debito" });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].value, 40);

    const trial = await generateBalanceteContabil(db, { financialYearId: "ano", budgetUnitId: "ug" });
    assert.equal(trial.find((account) => account.id === "debito")?.debitTotal, 130);
    assert.equal(trial.find((account) => account.id === "credito")?.creditTotal, 130);
    const monthly = await generateInternalReportDataset(connection, "BALANCETE_MENSAL", "ano", 2026, { month: 4 }, { budgetUnitIds: ["ug"] });
    const debitRow = monthly.sections[1].rows.find(row => row.contaCodigo === "ISOLATED.D");
    assert.equal(debitRow?.totalDebitos, 125);
    const noUnits = await generateInternalReportDataset(connection, "BALANCETE_MENSAL", "ano", 2026, { month: 4 }, { budgetUnitIds: [] });
    assert.ok(noUnits.sections[1].rows.every(row => row.totalDebitos === 0 && row.totalCreditos === 0));

    await assert.rejects(db.transaction(async tx => {
      await tx.insert(accountingTransactions).values({
        id: "scoped-invalid-transaction", governmentEntityId: "ente", budgetUnitId: "unbound-ug", financialYearId: "ano", date,
        history: "Unidade incompatível", status: "POSTADO", authorUsuarioId: "ana", authorEmployeeId: "servidora-ana",
      });
      await tx.insert(accountingEntries).values([
        { transactionId: "scoped-invalid-transaction", date, value: 1, valueDecimal: new Decimal("1.00"), type: "Débito", history: "x", accountId: "debito", authorId: "servidora-ana" },
        { transactionId: "scoped-invalid-transaction", date, value: 1, valueDecimal: new Decimal("1.00"), type: "Crédito", history: "x", accountId: "credito", authorId: "servidora-ana" },
      ]);
    }));
  } finally { try { await transport?.close(); } finally { await fixture.close(); } }
});

test("exportação de tesouraria e conciliações intersecta exercício, entidade e UGs autorizadas", async () => {
  const fixture = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(fixture.pg);
    const { connection } = transport;
    const executor = connection.db;
    for (const [id, budgetUnitId, value] of [["permitida", "ug", "12.00"], ["restrita", "ug-restrita", "99.00"]] as const) {
      await executor.insert(reconciliationBankAccounts).values({ id, bankName: id, agency: "0001", accountNumber: id, budgetUnitId });
      await executor.insert(reconciliationTreasuryMovements).values({ bankAccountId: id, financialYearId: "ano", date: new Date("2026-03-01"), type: "Revenue", direction: "Entrada", valueDecimal: new Decimal(value), status: "Confirmado" });
      await executor.insert(bankReconciliations).values({ bankAccountId: id, date: new Date("2026-03-01"), periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), systemBalance: Number(value), bankBalance: Number(value), systemBalanceDecimal: new Decimal(value), bankBalanceDecimal: new Decimal(value) });
    }
    const scope = { budgetUnitIds: ["ug"] };
    const balance = await generateInternalReportDataset(connection, "BALANCO_FINANCEIRO", "ano", 2026, {}, scope);
    assert.ok(JSON.stringify(balance).includes("permitida"));
    assert.ok(!JSON.stringify(balance).includes("restrita"));
    const reconciliation = await generateInternalReportDataset(connection, "CONCILIACAO_TESOURARIA", "ano", 2026, {}, scope);
    assert.equal(reconciliation.sections[0].rows.length, 1);
    assert.equal(reconciliation.sections[0].rows[0].banco, "permitida");
    const empty = await generateInternalReportDataset(connection, "BALANCO_FINANCEIRO", "ano", 2026, {}, { budgetUnitIds: [] });
    assert.ok(!JSON.stringify(empty).includes("permitida"));
    await assert.rejects(generateInternalReportDataset(connection, "RREO", "ano", 2026, {}, scope), /todas as unidades gestoras/i);
    await assert.rejects(generateInternalReportDataset(connection, "BALANCO_FINANCEIRO", "ano", 2025, {}, scope), /ano.*diverge/i);
    await assert.rejects(resolveFinancialReportScope(executor, "ano", { governmentEntityId: "outra" }), /entidade.*diverge/i);
    assert.equal((await resolveFinancialReportScope(executor, "ano")).fullEntity, true);
    assert.deepEqual((await resolveFinancialReportScope(executor, "ano", { budgetUnitId: "ug-restrita", budgetUnitIds: ["ug"] })).budgetUnitIds, []);
  } finally { try { await transport?.close(); } finally { await fixture.close(); } }
});

test("fechar e reabrir a Prefeitura não fecha a Câmara no mesmo ano", async () => {
  const fixture = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(fixture.pg);
    const { connection } = transport;
    const db = connection.db;
    await fixture.rules();
    await db.insert(governmentEntities).values({ id: "camara", code: "CAMARA", name: "Câmara de ensaio", type: "CAMARA" });
    await db.insert(planningBudgetUnits).values({ id: "ug-camara", code: "LEG.01", name: "Câmara", secretariatId: "secretaria" });
    await db.insert(planningEntityUnits).values({ governmentEntityId: "camara", budgetUnitId: "ug-camara" });
    await db.insert(financialYears).values({ id: "ano-camara", governmentEntityId: "camara", year: 2026, status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") });
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await db.insert(reconciliationBankAccounts).values({ id: "banco-camara", bankName: "Banco de ensaio", agency: "0001", accountNumber: "LEG-01", budgetUnitId: "ug-camara" });
    await db.insert(bankStatementItems).values({ bankAccountId: "banco-camara", date: new Date("2026-01-10"), direction: "Entrada", valueDecimal: new Decimal("1.00"), status: "Pendente" });
    const requester = { usuarioId: "ana", employeeId: "servidora-ana" };
    const authorizer = { usuarioId: "beatriz", employeeId: "servidora-ana" };
    const january = new Date("2026-01-01");
    await assert.rejects(requestAccountingMonthClose(connection, requester, "ano-camara", january), /pendencias/i);
    await requestAccountingMonthClose(connection, requester, "ano", january);
    await assert.rejects(authorizeAccountingMonthClose(connection, requester, "ano", january), /solicitante nao pode autorizar/i);
    await authorizeAccountingMonthClose(connection, authorizer, "ano", january);
    const posting = { date: new Date("2026-01-15"), history: "Postagem de isolamento", lines: [{ accountId: "debito", type: "Débito" as const, value: "10.00" }, { accountId: "credito", type: "Crédito" as const, value: "10.00" }] };
    await assert.rejects(postAccountingTransaction(connection, requester, { ...posting, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug" }), /competencia contabil nao esta aberta/i);
    await postAccountingTransaction(connection, requester, { ...posting, financialYearId: "ano-camara", governmentEntityId: "camara", budgetUnitId: "ug-camara" });
    const [chamberPosting] = await db.select().from(accountingTransactions).where(eq(accountingTransactions.financialYearId, "ano-camara")).limit(1);
    assert.ok(chamberPosting);
    await assert.rejects(fixture.pg.query('UPDATE "AccountingTransaction" SET "financialYearId"=$1 WHERE id=$2', ["ano", chamberPosting.id]), /entity.*financial year/i);
    await assert.rejects(postAccountingTransaction(connection, requester, { ...posting, financialYearId: "ano-camara", governmentEntityId: "ente", budgetUnitId: "ug" }), /entidade.*exercício/i);
    await requestAccountingMonthReopen(connection, requester, "ano", january, "Correção de ensaio por entidade.");
    await authorizeAccountingMonthReopen(connection, authorizer, "ano", january);
    await postAccountingTransaction(connection, requester, { ...posting, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug" });
    for (let month = 0; month < 12; month++) {
      const competence = new Date(Date.UTC(2026, month, 1));
      await requestAccountingMonthClose(connection, requester, "ano", competence);
      await authorizeAccountingMonthClose(connection, authorizer, "ano", competence);
    }
    await prepareAnnualAccountingClose(connection, requester, "ano");
    await assert.rejects(finalizeAnnualAccountingClose(connection, requester, "ano"), /quem preparou.*nao pode conclui-lo/i);
    await finalizeAnnualAccountingClose(connection, authorizer, "ano");
    assert.equal((await db.select().from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Encerrado");
    assert.equal((await db.select().from(financialYears).where(eq(financialYears.id, "ano-camara")))[0].status, "Aberto");
    assert.equal((await db.select({ total: count() }).from(monthlyAccountingCloses).where(eq(monthlyAccountingCloses.financialYearId, "ano-camara")))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(annualAccountingCloses).where(eq(annualAccountingCloses.financialYearId, "ano-camara")))[0].total, 0);
  } finally { try { await transport?.close(); } finally { await fixture.close(); } }
});
