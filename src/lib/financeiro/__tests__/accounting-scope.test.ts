import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlanningAccountingFixture } from "../../../../tests/helpers/planning-accounting-fixture";
import { authorizeAccountingMonthClose, authorizeAccountingMonthReopen, finalizeAnnualAccountingClose, postAccountingTransaction, prepareAnnualAccountingClose, requestAccountingMonthClose, requestAccountingMonthReopen } from "../index";
import { generateBalanceteContabil, generateDiarioContabil, generateRazaoContabil } from "../relatorios-legais";
import { generateInternalReportDataset } from "../report-delivery";
import { resolveFinancialReportScope } from "../report-scope";

test("contabilidade filtra Diario, Razao e Balancete pela entidade e UG sem misturar movimentos", async () => {
  const fixture = await createPlanningAccountingFixture();
  try {
    const { db } = fixture;
    await fixture.rules();
    const date = new Date("2026-04-15T12:00:00.000Z");
    const posted = await postAccountingTransaction(db, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01T00:00:00.000Z"),
      history: "Abertura contábil com escopo", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE",
      idempotencyKey: "scope:posted:opening", lines: [{ accountId: "debito", type: "Débito", value: "5.00" }, { accountId: "credito", type: "Crédito", value: "5.00" }],
    });
    assert.equal(posted.governmentEntityId, "ente");
    assert.equal(posted.budgetUnitId, "ug");
    await db.bankAccount.create({ data: { id: "canonical-restricted-bank", bankName: "Origem fora da UG", agency: "0001", accountNumber: "canonical-restricted", budgetUnitId: "ug-restrita" } });
    await assert.rejects(postAccountingTransaction(db, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01"), history: "Escopo explícito divergente da origem", sourceModule: "PLANEJAMENTO", sourceType: "BANK_ACCOUNT_OPENING_BALANCE", sourceId: "canonical-restricted-bank", eventType: "PLANNING_BUDGET_OPENING_EXPENSE", lines: [{ accountId: "debito", type: "Débito", value: "5.00" }, { accountId: "credito", type: "Crédito", value: "5.00" }],
    }), /unidade gestora informada diverge da origem/i);
    await assert.rejects(postAccountingTransaction(db, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01T00:00:00.000Z"), history: "Abertura contábil com escopo", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE", idempotencyKey: "scope:posted:opening", lines: [{ accountId: "debito", type: "Débito", value: "7.00" }, { accountId: "credito", type: "Crédito", value: "7.00" }],
    }), /chave contábil.*outros dados/i);
    await db.accountingPlan.create({ data: { id: "sintetica", code: "ISOLATED", name: "Conta sintética de ensaio", type: "Ativo" } });
    await assert.rejects(postAccountingTransaction(db, { usuarioId: "ana", employeeId: "servidora-ana" }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-01-01"), history: "Conta sintética inválida", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE", lines: [{ accountId: "sintetica", type: "Débito", value: "1.00" }, { accountId: "credito", type: "Crédito", value: "1.00" }],
    }), /conta sintética/i);
    await assert.rejects(postAccountingTransaction(db, { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] }, {
      financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug-restrita", date: new Date("2026-01-01T00:00:00.000Z"),
      history: "Unidade fora do perfil", sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", eventType: "PLANNING_BUDGET_OPENING_EXPENSE",
      idempotencyKey: "scope:posted:denied", lines: [{ accountId: "debito", type: "Débito", value: "6.00" }, { accountId: "credito", type: "Crédito", value: "6.00" }],
    }));
    for (const [index, budgetUnitId, value] of [[1, "ug", "125.00"], [2, "ug-restrita", "40.00"]] as const) {
      await db.accountingTransaction.create({
        data: {
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
          entries: { create: [
            { id: `scoped-debit-${index}`, date, value: Number(value), valueDecimal: value, type: "Débito", history: "Teste de escopo", accountId: "debito", authorId: "servidora-ana" },
            { id: `scoped-credit-${index}`, date, value: Number(value), valueDecimal: value, type: "Crédito", history: "Teste de escopo", accountId: "credito", authorId: "servidora-ana" },
          ] },
        },
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
    const monthly = await generateInternalReportDataset(db, "BALANCETE_MENSAL", "ano", 2026, { month: 4 }, { budgetUnitIds: ["ug"] });
    const debitRow = monthly.sections[1].rows.find(row => row.contaCodigo === "ISOLATED.D");
    assert.equal(debitRow?.totalDebitos, 125);
    const noUnits = await generateInternalReportDataset(db, "BALANCETE_MENSAL", "ano", 2026, { month: 4 }, { budgetUnitIds: [] });
    assert.ok(noUnits.sections[1].rows.every(row => row.totalDebitos === 0 && row.totalCreditos === 0));

    await assert.rejects(db.accountingTransaction.create({
      data: {
        id: "scoped-invalid-transaction", governmentEntityId: "ente", budgetUnitId: "unbound-ug", financialYearId: "ano", date,
        history: "Unidade incompatível", status: "POSTADO", authorUsuarioId: "ana", authorEmployeeId: "servidora-ana",
        entries: { create: [
          { date, value: 1, valueDecimal: "1.00", type: "Débito", history: "x", accountId: "debito", authorId: "servidora-ana" },
          { date, value: 1, valueDecimal: "1.00", type: "Crédito", history: "x", accountId: "credito", authorId: "servidora-ana" },
        ] },
      },
    }));
  } finally { await fixture.close(); }
});

test("exportação de tesouraria e conciliações intersecta exercício, entidade e UGs autorizadas", async () => {
  const fixture = await createPlanningAccountingFixture();
  try {
    const { db } = fixture;
    for (const [id, budgetUnitId, value] of [["permitida", "ug", "12.00"], ["restrita", "ug-restrita", "99.00"]] as const) {
      await db.bankAccount.create({ data: { id, bankName: id, agency: "0001", accountNumber: id, budgetUnitId } });
      await db.treasuryMovement.create({ data: { bankAccountId: id, financialYearId: "ano", date: new Date("2026-03-01"), type: "Revenue", direction: "Entrada", valueDecimal: value, status: "Confirmado" } });
      await db.bankReconciliation.create({ data: { bankAccountId: id, date: new Date("2026-03-01"), periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), systemBalance: Number(value), bankBalance: Number(value), systemBalanceDecimal: value, bankBalanceDecimal: value } });
    }
    const scope = { budgetUnitIds: ["ug"] };
    const balance = await generateInternalReportDataset(db, "BALANCO_FINANCEIRO", "ano", 2026, {}, scope);
    assert.ok(JSON.stringify(balance).includes("permitida"));
    assert.ok(!JSON.stringify(balance).includes("restrita"));
    const reconciliation = await generateInternalReportDataset(db, "CONCILIACAO_TESOURARIA", "ano", 2026, {}, scope);
    assert.equal(reconciliation.sections[0].rows.length, 1);
    assert.equal(reconciliation.sections[0].rows[0].banco, "permitida");
    const empty = await generateInternalReportDataset(db, "BALANCO_FINANCEIRO", "ano", 2026, {}, { budgetUnitIds: [] });
    assert.ok(!JSON.stringify(empty).includes("permitida"));
    await assert.rejects(generateInternalReportDataset(db, "RREO", "ano", 2026, {}, scope), /todas as unidades gestoras/i);
    await assert.rejects(generateInternalReportDataset(db, "BALANCO_FINANCEIRO", "ano", 2025, {}, scope), /ano.*diverge/i);
    await assert.rejects(resolveFinancialReportScope(db, "ano", { governmentEntityId: "outra" }), /entidade.*diverge/i);
    assert.equal((await resolveFinancialReportScope(db, "ano")).fullEntity, true);
    assert.deepEqual((await resolveFinancialReportScope(db, "ano", { budgetUnitId: "ug-restrita", budgetUnitIds: ["ug"] })).budgetUnitIds, []);
  } finally { await fixture.close(); }
});

test("fechar e reabrir a Prefeitura não fecha a Câmara no mesmo ano", async () => {
  const fixture = await createPlanningAccountingFixture();
  try {
    const { db } = fixture;
    await fixture.rules();
    await db.governmentEntity.create({ data: { id: "camara", code: "CAMARA", name: "Câmara de ensaio", type: "CAMARA" } });
    await db.budgetUnit.create({ data: { id: "ug-camara", code: "LEG.01", name: "Câmara", secretariatId: "secretaria" } });
    await db.planningEntityUnit.create({ data: { governmentEntityId: "camara", budgetUnitId: "ug-camara" } });
    await db.financialYear.create({ data: { id: "ano-camara", governmentEntityId: "camara", year: 2026, status: "Aberto", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31T23:59:59.999Z") } });
    await db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await db.bankAccount.create({ data: { id: "banco-camara", bankName: "Banco de ensaio", agency: "0001", accountNumber: "LEG-01", budgetUnitId: "ug-camara" } });
    await db.bankStatementItem.create({ data: { bankAccountId: "banco-camara", date: new Date("2026-01-10"), direction: "Entrada", valueDecimal: "1.00", status: "Pendente" } });
    const requester = { usuarioId: "ana", employeeId: "servidora-ana" };
    const authorizer = { usuarioId: "beatriz", employeeId: "servidora-ana" };
    const january = new Date("2026-01-01");
    await assert.rejects(requestAccountingMonthClose(db, requester, "ano-camara", january), /pendencias/i);
    await requestAccountingMonthClose(db, requester, "ano", january);
    await assert.rejects(authorizeAccountingMonthClose(db, requester, "ano", january), /solicitante nao pode autorizar/i);
    await authorizeAccountingMonthClose(db, authorizer, "ano", january);
    const posting = { date: new Date("2026-01-15"), history: "Postagem de isolamento", lines: [{ accountId: "debito", type: "Débito" as const, value: "10.00" }, { accountId: "credito", type: "Crédito" as const, value: "10.00" }] };
    await assert.rejects(postAccountingTransaction(db, requester, { ...posting, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug" }), /competencia contabil nao esta aberta/i);
    await postAccountingTransaction(db, requester, { ...posting, financialYearId: "ano-camara", governmentEntityId: "camara", budgetUnitId: "ug-camara" });
    const chamberPosting = await db.accountingTransaction.findFirstOrThrow({ where: { financialYearId: "ano-camara" } });
    await assert.rejects(fixture.pg.query('UPDATE "AccountingTransaction" SET "financialYearId"=$1 WHERE id=$2', ["ano", chamberPosting.id]), /entity.*financial year/i);
    await assert.rejects(postAccountingTransaction(db, requester, { ...posting, financialYearId: "ano-camara", governmentEntityId: "ente", budgetUnitId: "ug" }), /entidade.*exercício/i);
    await requestAccountingMonthReopen(db, requester, "ano", january, "Correção de ensaio por entidade.");
    await authorizeAccountingMonthReopen(db, authorizer, "ano", january);
    await postAccountingTransaction(db, requester, { ...posting, financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug" });
    for (let month = 0; month < 12; month++) {
      const competence = new Date(Date.UTC(2026, month, 1));
      await requestAccountingMonthClose(db, requester, "ano", competence);
      await authorizeAccountingMonthClose(db, authorizer, "ano", competence);
    }
    await prepareAnnualAccountingClose(db, requester, "ano");
    await assert.rejects(finalizeAnnualAccountingClose(db, requester, "ano"), /quem preparou.*nao pode conclui-lo/i);
    await finalizeAnnualAccountingClose(db, authorizer, "ano");
    assert.equal((await db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Encerrado");
    assert.equal((await db.financialYear.findUniqueOrThrow({ where: { id: "ano-camara" } })).status, "Aberto");
    assert.equal(await db.monthlyAccountingClose.count({ where: { financialYearId: "ano-camara" } }), 0);
    assert.equal(await db.annualAccountingClose.count({ where: { financialYearId: "ano-camara" } }), 0);
  } finally { await fixture.close(); }
});
