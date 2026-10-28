import assert from "node:assert/strict";
import test from "node:test";
import { createFinancePagesDatabase } from "./helpers/finance-pages-database";
import { Decimal } from "../src/db/decimal";
import { budgetReservations } from "../src/db/schema/finance-budget";
import { listFinancePageAccounts, listFinancePageSources, listFinancePageUnits, listFinancePageYears } from "../src/db/repositories/finance-pages/catalog";
import { readFinanceAccountingEntries, readFinanceAccountingOverview, readFinanceAnnualStages, readFinancePostingRules } from "../src/db/repositories/finance-pages/accounting";
import { hasFinancePageUndocumentedMovement, listFinancePageBankAccounts, listFinancePageBanks, listFinancePageBudgetUnits, listFinancePagePayments, listFinancePageTransfers, readFinancePageAutomations } from "../src/db/repositories/finance-pages/banking";
import { listFinancePageCreditRequests, listFinancePageExpenses, listFinancePageUnboundReceipts, readFinanceCommitmentOrigins } from "../src/db/repositories/finance-pages/budget";
import { listFinancePageAppropriations, listFinancePageCommitments, listFinancePageDocuments, listFinancePageEmployees, listFinancePageReservations, listFinancePageRetentionRules, listFinancePageSettlements, listFinancePageSuppliers, listFinancePageWithholdings } from "../src/db/repositories/finance-pages/operations";
import { listFinancePagePayables, listFinancePageRapAuthors } from "../src/db/repositories/finance-pages/payables";
import { listFinancePagePersonnelRevisions, listFinancePagePersonnelSources, listFinancePageRevenueNatures, listFinancePageRevenues } from "../src/db/repositories/finance-pages/reports";

const access = { allowedBudgetUnitIds: ["unit"] };
const timestampGolden = "2026-10-19T12:34:56.789Z";

test("Financeiro SSR: SQL histórico, escopo, relações e escalares reais", { timeout: 240_000 }, async t => {
  const { connection, close } = await createFinancePagesDatabase();
  const db = connection.db;
  try {
    await t.test("ente/UG e every preservam recorte parcial e crédito sem itens", async () => {
      assert.deepEqual((await listFinancePageUnits(db, access)).map(row => row.budgetUnitId), ["unit"]);
      assert.deepEqual((await listFinancePageYears(db, access)).map(row => row.id), ["year", "prior-year"]);
      assert.deepEqual(await listFinancePageYears(db, { allowedBudgetUnitIds: [] }), []);
      assert.deepEqual((await listFinancePageAppropriations(db, access)).map(row => row.id), ["appropriation"]);
      assert.deepEqual((await listFinancePageCreditRequests(db, access)).map(row => row.id), ["credit-empty"]);
      assert.equal((await listFinancePageCreditRequests(db)).length, 2);
      assert.deepEqual((await listFinancePageBudgetUnits(db, access)).map(row => row.id), ["unit"]);
    });

    await t.test("snapshot paginado mantém autoria, dimensões congeladas, Decimal e UTC", async () => {
      const filters = { governmentEntityId: "entity", financialYearId: "year", budgetUnitIds: ["unit"], page: 1, account: "Disponibilidades", q: "Memória", sourceModule: "FINANCEIRO", from: new Date("2026-10-19T00:00:00Z"), through: new Date("2026-10-19T23:59:59.999Z") };
      const first = await readFinanceAccountingEntries(connection, filters);
      const second = await readFinanceAccountingEntries(connection, { ...filters, page: 2 });
      assert.equal(first.count, 51);
      assert.equal(first.transactions.length, 50);
      assert.equal(first.transactions[0].id, "transaction-051");
      assert.deepEqual(second.transactions.map(row => row.id), ["transaction-001"]);
      assert.equal(first.transactions[0].date.toISOString(), timestampGolden);
      assert.equal(first.transactions[0].authorUsuario.nome, "Operador financeiro");
      assert.equal(first.transactions[0].entries[0].author.name, "Autor funcional");
      assert.equal(first.transactions[0].entries[0].valueDecimal?.toFixed(2), "90071992547409.96");
      assert.deepEqual(first.transactions[0].entries[0].classificationSnapshot, { dimensions: { resourceSourceId: "historical-source" } });
      assert.equal((await readFinanceAccountingEntries(connection, { ...filters, budgetUnitIds: [] })).count, 0);
      const overview = await readFinanceAccountingOverview(db, ["entity"], ["unit"]);
      assert.equal(overview.transactions.length, 20);
      assert.equal(overview.monthlyCloses[0].events[0].authorizedByUsuario, null);
      assert.equal(overview.monthlyCloses[0].events[0].requestedAt.toISOString(), timestampGolden);
      assert.equal(overview.annualCloses[0].closedByUsuario, null);
    });

    await t.test("despesa preserva pessoa/empresa nullable, sinais e pagamentos vigentes", async () => {
      const [commitment] = await listFinancePageCommitments(db, access);
      assert.equal(commitment.supplier.company, null);
      assert.equal(commitment.supplier.person?.fullName, "Fornecedor pessoa física");
      assert.equal(commitment.purchaseReceipt, null);
      assert.equal(commitment.financialDocument, null);
      assert.deepEqual(commitment.appropriation, { id: "appropriation", code: "01.3.3.90.30", financialYearId: "year", budgetUnitId: "unit", resourceSourceId: "source", budgetUnit: { name: "UG autorizada" } });
      assert.equal(commitment.date.toISOString(), timestampGolden);
      assert.ok((await listFinancePageCommitments(db, access, true)).every(row => row.appropriation.budgetUnit.name === "UG autorizada"));
      const effective = commitment.movements.reduce((total, movement) => movement.type === "Reforço" ? total.plus(movement.valueDecimal) : total.minus(movement.valueDecimal), new Decimal(commitment.valueDecimal!));
      assert.equal(effective.toFixed(2), "90071992547409.95");
      const [settlement] = await listFinancePageSettlements(db, access, true);
      assert.equal(settlement.fiscalDocumentIssueDate, null);
      assert.equal(settlement.financialDocument?.number, "FD-001");
      assert.deepEqual(settlement.commitment.appropriation, { financialYearId: "year" });
      assert.equal((await listFinancePageSettlements(db, access))[0].commitment.appropriation.financialYearId, "year");
      assert.equal(settlement.payments.reduce((total, payment) => total.plus(payment.valueDecimal!), new Decimal(0)).toFixed(2), "0.30");
      const [reservation] = await listFinancePageReservations(db, access);
      assert.equal(reservation.valueDecimal?.toFixed(2), "0.30");
      assert.deepEqual(reservation.appropriation, { id: "appropriation", code: "01.3.3.90.30", budgetUnit: { name: "UG autorizada" } });
      assert.equal(reservation.expense, null);
      assert.equal((await listFinancePagePayments(db, access, true)).length, 1);
      assert.equal((await listFinancePageWithholdings(db, access))[0].retention.payment.orderNumber, "OP-001");
      assert.deepEqual((await listFinancePageDocuments(db, "legal")).map(row => row.id), ["document"]);
      assert.equal((await listFinancePageDocuments(db)).some(row => row.id === "template"), false);
      assert.equal((await listFinancePageSuppliers(db))[0].company, null);
      await db.insert(budgetReservations).values([
        ...Array.from({ length: 51 }, (_, index) => ({ id: `reservation-page-${index}`, number: `RES-PAGE-${index}`, date: new Date(Date.UTC(2026, 9, 20, 0, 0, index)), value: 0.01, valueDecimal: new Decimal("0.01"), appropriationId: "appropriation", status: "Ativa" })),
        { id: "reservation-inactive", number: "RES-INACTIVE", date: new Date("2026-10-21T00:00:00Z"), value: 0.01, valueDecimal: new Decimal("0.01"), appropriationId: "appropriation", status: "Cancelada" },
        { id: "reservation-denied", number: "RES-DENIED", date: new Date("2026-10-22T00:00:00Z"), value: 0.01, valueDecimal: new Decimal("0.01"), appropriationId: "denied-appropriation", status: "Ativa" },
      ]);
      const recentReservations = await listFinancePageReservations(db, access);
      assert.equal(recentReservations.length, 50);
      assert.ok(recentReservations.every((row, index) => row.id !== "reservation-denied" && (index === 0 || recentReservations[index - 1].date >= row.date)));
      const activeReservations = await listFinancePageReservations(db, access, true);
      assert.equal(activeReservations.length, 52, "Reservas ativas não herdam o limite de 50 da listagem recente");
      assert.ok(activeReservations.every(row => row.status === "Ativa" && row.appropriation.budgetUnit.name === "UG autorizada"));
      assert.deepEqual(await listFinancePageReservations(db, { allowedBudgetUnitIds: [] }), []);
      assert.deepEqual(await listFinancePageReservations(db, { allowedBudgetUnitIds: [] }, true), []);
    });

    await t.test("tesouraria exige acesso às duas pontas e distingue movimento sem fonte", async () => {
      assert.deepEqual((await listFinancePageTransfers(db, access)).map(row => row.id), ["transfer"]);
      assert.equal((await listFinancePageTransfers(db)).length, 2);
      assert.equal((await listFinancePageTransfers(db, access))[0].date.toISOString(), timestampGolden);
      assert.equal((await listFinancePageBankAccounts(db, access, true)).find(row => row.id === "bank")?.permittedSources.length, 1);
      assert.equal(await hasFinancePageUndocumentedMovement(db, "bank"), false);
      assert.equal(await hasFinancePageUndocumentedMovement(db, "second-bank"), true);
      assert.deepEqual(await listFinancePageBankAccounts(db, { allowedBudgetUnitIds: [] }), []);
    });

    await t.test("receita redutora, rateios e relatórios não perdem centavos ou null", async () => {
      const [revenue] = await listFinancePageRevenues(db, access);
      assert.equal(revenue.id, "revenue");
      assert.equal(revenue.valueDecimal?.toFixed(2), "90071992547409.96");
      assert.equal(revenue.date.toISOString(), timestampGolden);
      assert.equal(revenue.classification, "REDUTORA");
      assert.equal(revenue.history, null);
      assert.equal(revenue.reversal, null);
      assert.equal(revenue.resourceRedistributions.reduce((total, row) => total.plus(row.valueDecimal), new Decimal(0)).toFixed(2), "0.30");
      assert.deepEqual(await listFinancePagePersonnelSources(db, "entity", ["unit"]), [{ sourceType: "SETTLEMENT" }]);
      const [revision] = await listFinancePagePersonnelRevisions(db, "year");
      assert.equal(revision.effectiveFrom.toISOString(), timestampGolden);
      assert.equal(revision.prudentialLimit.toFixed(4), "51.3000");
    });

    await t.test("RAP mantém cadeia anual, vínculo herdado, eventos e autoria", async () => {
      const payables = await listFinancePagePayables(db, access);
      const payable = payables.find(row => row.id === "payable")!;
      assert.equal(payable.previousPayableCarryForward?.financialYear.year, 2025);
      assert.equal(payables.find(row => row.id === "prior-payable")?.successorPayableCarryForward?.id, "payable");
      assert.equal(payable.events[0].actorUsuario.nome, "Operador financeiro");
      assert.equal(payable.events[0].createdAt.toISOString(), timestampGolden);
      assert.equal(payable.inheritedSettlements[0].settlement.date.toISOString(), timestampGolden);
      assert.equal(payable.inheritedSettlements[0].settlement.payments.length, 2);
      assert.equal(payable.inheritedSettlements[0].valueDecimal.toFixed(2), "0.30");
      assert.deepEqual(await listFinancePagePayables(db, { allowedBudgetUnitIds: [] }), []);
      const annual = await readFinanceAnnualStages(db, ["entity"], ["year"]);
      assert.equal(annual.editions[0].createdAt.toISOString(), timestampGolden);
      assert.deepEqual(annual.editions[0].payload, { governmentEntityId: "entity" });
    });

    await t.test("demais seletores executam o SQL físico completo", async () => {
      await listFinancePageAccounts(db); await listFinancePageSources(db); await listFinancePageRevenueNatures(db);
      await listFinancePageEmployees(db); await listFinancePageRapAuthors(db); await listFinancePageRetentionRules(db);
      await listFinancePageExpenses(db, access); await listFinancePageUnboundReceipts(db); await listFinancePageBanks(db);
      await readFinanceCommitmentOrigins(db); await readFinancePostingRules(db); await readFinancePageAutomations(db, "Banco A");
    });
  } finally { await close(); }
});
