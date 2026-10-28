import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { createFinanceLegacyStoriesFixture } from "../../../../tests/helpers/finance-legacy-stories-fixture";
import { users } from "@/db/schema/identity";
import { employees, secretariats } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { infrastructureServices } from "@/db/schema/infrastructure";
import { budgetAppropriations, budgetReservations, commitments } from "@/db/schema/finance-budget";
import { expenses } from "@/db/schema/finance-expenses";
import { settlements } from "@/db/schema/finance-settlements";
import { payments } from "@/db/schema/finance-payments";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";
import { financialDocuments } from "@/db/schema/finance-documents";
import { accountingEntries, accountingTransactions } from "@/db/schema/finance-accounting";
import {
  approveExpenseRequest,
  createBudgetReservation,
  createCommitment,
  createExpenseRequest,
  createPayment,
  createSettlement,
  type FinanceActor,
} from "../index";

let fixture: Awaited<ReturnType<typeof createFinanceLegacyStoriesFixture>> | undefined;
let db: DatabaseExecutor;
let databaseConnection: DatabaseConnection;

before(async () => {
  fixture = await createFinanceLegacyStoriesFixture();
  databaseConnection = fixture.connection;
  db = fixture.connection.db;
});
after(async () => { await fixture?.close(); });

test("generates linked internal financial documents with each financial fact", async () => {
  const [[user], [employee], [approver], [appropriation], [secretariat], [document], [bankAccount]] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
    db.select({ id: employees.id }).from(employees).limit(1),
    db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(eq(users.ativo, true)).limit(1),
    db.select({ id: budgetAppropriations.id }).from(budgetAppropriations).where(eq(budgetAppropriations.code, "0101.04.122.0001.2002.3.3.90.30.00")).limit(1),
    db.select({ id: secretariats.id }).from(secretariats).limit(1),
    db.select({ id: documents.id }).from(documents).where(eq(documents.id, "doc-nf-lagoaseca-01")),
    db.select({ id: reconciliationBankAccounts.id }).from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, "poc-robonuvem-checking-10001")),
  ]);
  assert.ok(user && employee && appropriation && secretariat && document && bankAccount, "A fixture deve fornecer os cadastros, a dotação, o GED e a conta bancária.");
  const secondApprover = approver?.id === user.id
    ? (await db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), ne(users.id, user.id))).limit(1))[0]
    : approver;
  assert.ok(secondApprover, "A fixture deve fornecer um aprovador diferente do solicitante.");

  const actor: FinanceActor = { usuarioId: user.id, employeeId: employee.id };
  const suffix = Date.now().toString();
  const date = new Date("2026-04-15T10:00:00.000Z");
  const previousAccountingMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  let expenseId = "";
  let reservationId = "";
  let commitmentId = "";
  let settlementId = "";
  let paymentId = "";
  let obrasServiceId = "";

  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  try {
    const [obrasService] = await db.insert(infrastructureServices).values({
        protocolo: `OS-DOC-${suffix}`,
        tipo: "Teste",
        descricao: "Ordem de serviço para rastreabilidade do empenho",
        local: "Base POC",
        budgetAppropriationId: appropriation.id,
    }).returning();
    obrasServiceId = obrasService.id;
    const expense = await createExpenseRequest(databaseConnection, actor, {
      date,
      description: `Documentos financeiros ${suffix}`,
      value: "100.00",
      appropriationId: appropriation.id,
      supplierId: "supp-lagoaseca-01",
      secretariatId: secretariat.id,
      sourceModule: "TEST",
      sourceType: "FINANCIAL_DOCUMENT",
      eventType: "TEST",
    });
    expenseId = expense.id;
    await approveExpenseRequest(databaseConnection, { usuarioId: secondApprover.id, employeeId: secondApprover.employeeId }, expense.id);
    const reservation = await createBudgetReservation(databaseConnection, actor, {
      number: `RES-DOC-${suffix}`,
      date,
      value: "100.00",
      appropriationId: appropriation.id,
      expenseId: expense.id,
    });
    reservationId = reservation.id;
    const commitment = await createCommitment(databaseConnection, actor, {
      number: `EMP-DOC-${suffix}`,
      date,
      value: "100.00",
      type: "Ordinário",
      history: "Teste de documento interno",
      appropriationId: appropriation.id,
      supplierId: "supp-lagoaseca-01",
      reservationId: reservation.id,
      obrasServiceId,
    });
    commitmentId = commitment.id;
    const [commitmentDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.commitmentId, commitmentId));
    assert.ok(commitmentDocument);
    assert.equal(commitmentDocument.documentType, "NOTA_DE_EMPENHO");
    assert.equal(commitmentDocument.number, `NE-${commitment.number}`);
    assert.equal(commitmentDocument.generatedByUsuarioId, actor.usuarioId);
    assert.equal((commitmentDocument.snapshot as { commitment: { obrasService: { id: string; protocolo: string } } }).commitment.obrasService.id, obrasServiceId);
    assert.equal((commitmentDocument.snapshot as { commitment: { obrasService: { id: string; protocolo: string } } }).commitment.obrasService.protocolo, `OS-DOC-${suffix}`);

    const settlement = await createSettlement(databaseConnection, actor, {
      date,
      value: "100.00",
      commitmentId,
      documentId: document.id,
      authorId: employee.id,
      fiscalDocumentNumber: `DOC-${suffix}`,
      fiscalDocumentIssueDate: date,
    });
    settlementId = settlement.id;
    const [settlementDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.settlementId, settlementId));
    assert.ok(settlementDocument);
    assert.equal(settlementDocument.documentType, "NOTA_DE_LIQUIDACAO");
    assert.equal((settlementDocument.snapshot as { settlement: { commitmentId: string } }).settlement.commitmentId, commitmentId);
    assert.equal((settlementDocument.snapshot as { settlement: { fiscalDocumentNumber: string } }).settlement.fiscalDocumentNumber, `DOC-${suffix}`);

    const payment = await createPayment(databaseConnection, actor, {
      orderNumber: `OP-DOC-${suffix}`,
      date,
      value: "100.00",
      commitmentId,
      settlementId,
      bankAccountId: bankAccount.id,
      supplierId: "supp-lagoaseca-01",
      paymentMethod: "Transferência",
    });
    paymentId = payment.id;
    const [paymentDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.paymentId, paymentId));
    assert.ok(paymentDocument);
    assert.equal(paymentDocument.documentType, "ORDEM_DE_PAGAMENTO");
    assert.equal((paymentDocument.snapshot as { payment: { settlementId: string; commitmentId: string } }).payment.settlementId, settlementId);
    assert.equal((paymentDocument.snapshot as { payment: { settlementId: string; commitmentId: string } }).payment.commitmentId, commitmentId);
  } finally {
    if (paymentId) await db.delete(financialDocuments).where(eq(financialDocuments.paymentId, paymentId));
    if (settlementId) await db.delete(financialDocuments).where(eq(financialDocuments.settlementId, settlementId));
    if (commitmentId) await db.delete(financialDocuments).where(eq(financialDocuments.commitmentId, commitmentId));
    const sourceIds = [commitmentId, settlementId].filter(Boolean);
    if (sourceIds.length) {
      const transactions = await db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(inArray(accountingTransactions.sourceId, sourceIds));
      if (transactions.length) {
        await db.delete(accountingEntries).where(inArray(accountingEntries.transactionId, transactions.map(transaction => transaction.id)));
        await db.delete(accountingTransactions).where(inArray(accountingTransactions.id, transactions.map(transaction => transaction.id)));
      }
    }
    if (paymentId) await db.delete(payments).where(eq(payments.id, paymentId));
    if (settlementId) await db.delete(settlements).where(eq(settlements.id, settlementId));
    if (obrasServiceId) await db.update(infrastructureServices).set({ commitmentId: null }).where(and(eq(infrastructureServices.id, obrasServiceId), eq(infrastructureServices.commitmentId, commitmentId)));
    if (commitmentId) await db.delete(commitments).where(eq(commitments.id, commitmentId));
    if (obrasServiceId) await db.delete(infrastructureServices).where(eq(infrastructureServices.id, obrasServiceId));
    if (reservationId) await db.delete(budgetReservations).where(eq(budgetReservations.id, reservationId));
    if (expenseId) await db.delete(expenses).where(eq(expenses.id, expenseId));
    if (previousAccountingMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousAccountingMode;
  }
});
