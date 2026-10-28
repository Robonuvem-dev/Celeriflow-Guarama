import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { createFinanceLegacyStoriesFixture } from "../../../../tests/helpers/finance-legacy-stories-fixture";
import { users } from "@/db/schema/identity";
import { employees, secretariats } from "@/db/schema/administration";
import { budgetAppropriations, budgetReservations, commitments } from "@/db/schema/finance-budget";
import { expenses } from "@/db/schema/finance-expenses";
import { financialDocuments } from "@/db/schema/finance-documents";
import { accountingEntries, accountingTransactions } from "@/db/schema/finance-accounting";
import { processEvents, processes, processSubjects, processTypes } from "@/db/schema/processes";
import {
  approveExpenseRequest,
  createBudgetReservation,
  createCommitment,
  createExpenseRequest,
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

test("releases a protocol awaiting accounting when its commitment is issued", async () => {
  const [[actorUser], [actorEmployee], [appropriation], [secretariat]] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
    db.select({ id: employees.id }).from(employees).limit(1),
    db.select({ id: budgetAppropriations.id }).from(budgetAppropriations).where(eq(budgetAppropriations.code, "0101.04.122.0001.2002.3.3.90.30.00")).limit(1),
    db.select({ id: secretariats.id }).from(secretariats).limit(1),
  ]);
  assert.ok(actorUser && actorEmployee && appropriation && secretariat, "A fixture deve fornecer os atores, a dotação e a secretaria.");

  const [secondApprover] = await db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), ne(users.id, actorUser.id))).limit(1);
  assert.ok(secondApprover, "A fixture deve fornecer um aprovador diferente do solicitante.");

  const actor: FinanceActor = { usuarioId: actorUser.id, employeeId: actorEmployee.id };
  const suffix = Date.now().toString();
  const date = new Date("2026-04-15T10:00:00.000Z");
  const previousAccountingMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  let processTypeId = "";
  let processId = "";
  let expenseId = "";
  let reservationId = "";
  let commitmentId = "";

  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  try {
    const { processType, subject } = await withDatabaseTransaction(databaseConnection, async tx => {
      const [processType] = await tx.insert(processTypes).values({ name: `Teste de liberação contábil ${suffix}` }).returning();
      const [subject] = await tx.insert(processSubjects).values({ processTypeId: processType.id, name: `Empenho ${suffix}` }).returning();
      return { processType, subject };
    });
    processTypeId = processType.id;
    const [process] = await db.insert(processes).values({
        protocolNumber: `TESTE-CONTABIL-${suffix}`,
        status: "Aguardando Contabilidade",
        processTypeId: processType.id,
        subjectId: subject.id,
    }).returning();
    processId = process.id;

    const expense = await createExpenseRequest(databaseConnection, actor, {
      date,
      description: `Despesa para liberação de protocolo ${suffix}`,
      value: "100.00",
      appropriationId: appropriation.id,
      supplierId: "supp-lagoaseca-01",
      secretariatId: secretariat.id,
      sourceModule: "TEST",
      sourceType: "COMMITMENT_PROTOCOL_GATE",
      eventType: "TEST",
    });
    expenseId = expense.id;
    await approveExpenseRequest(databaseConnection, { usuarioId: secondApprover.id, employeeId: secondApprover.employeeId }, expense.id);
    const reservation = await createBudgetReservation(databaseConnection, actor, {
      number: `RES-PROTOCOLO-${suffix}`,
      date,
      value: "100.00",
      appropriationId: appropriation.id,
      expenseId: expense.id,
    });
    reservationId = reservation.id;
    const commitment = await createCommitment(databaseConnection, actor, {
      number: `EMP-PROTOCOLO-${suffix}`,
      date,
      value: "100.00",
      type: "Ordinário",
      history: "Emissão que libera protocolo aguardando contabilidade",
      appropriationId: appropriation.id,
      supplierId: "supp-lagoaseca-01",
      reservationId: reservation.id,
      processId: process.id,
    });
    commitmentId = commitment.id;

    const [[updatedProcess], [event]] = await Promise.all([
      db.select({ status: processes.status }).from(processes).where(eq(processes.id, process.id)),
      db.select({ previousStatus: processEvents.previousStatus, newStatus: processEvents.newStatus, metadata: processEvents.metadata }).from(processEvents).where(and(eq(processEvents.processId, process.id), eq(processEvents.eventType, "ACCOUNTING_RELEASED"))).limit(1),
    ]);
    assert.ok(updatedProcess && event);
    assert.equal(updatedProcess.status, "Recebido");
    assert.equal(event.previousStatus, "Aguardando Contabilidade");
    assert.equal(event.newStatus, "Recebido");
    assert.deepEqual(JSON.parse(event.metadata ?? ""), {
      commitmentId: commitment.id,
      commitmentNumber: commitment.number,
      commitmentValue: "100.00",
    });
  } finally {
    const transactions = commitmentId
      ? await db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(eq(accountingTransactions.sourceId, commitmentId))
      : [];
    if (transactions.length) {
      await db.delete(accountingEntries).where(inArray(accountingEntries.transactionId, transactions.map(transaction => transaction.id)));
      await db.delete(accountingTransactions).where(inArray(accountingTransactions.id, transactions.map(transaction => transaction.id)));
    }
    if (commitmentId) await db.delete(financialDocuments).where(eq(financialDocuments.commitmentId, commitmentId));
    if (commitmentId) await db.delete(commitments).where(eq(commitments.id, commitmentId));
    if (reservationId) await db.delete(budgetReservations).where(eq(budgetReservations.id, reservationId));
    if (expenseId) await db.delete(expenses).where(eq(expenses.id, expenseId));
    if (processId) await db.delete(processes).where(eq(processes.id, processId));
    if (processTypeId) await db.delete(processTypes).where(eq(processTypes.id, processTypeId));
    if (previousAccountingMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousAccountingMode;
  }
});
