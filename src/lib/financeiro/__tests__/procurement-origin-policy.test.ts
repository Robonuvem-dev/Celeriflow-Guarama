import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { createFinanceLegacyStoriesFixture } from "../../../../tests/helpers/finance-legacy-stories-fixture";
import { Decimal } from "@/db/decimal";
import { createId } from "@/db/ids";
import { users } from "@/db/schema/identity";
import { employees, secretariats } from "@/db/schema/administration";
import { suppliers } from "@/db/schema/registry";
import { financialYears } from "@/db/schema/finance-years";
import { budgetAppropriations, budgetReservations, commitments } from "@/db/schema/finance-budget";
import { expenses } from "@/db/schema/finance-expenses";
import { financialDocuments } from "@/db/schema/finance-documents";
import { accountingEntries, accountingTransactions } from "@/db/schema/finance-accounting";
import { planningBudgetUnits } from "@/db/schema/planning-budget";
import { planningExpenseNatures, planningResourceSources } from "@/db/schema/planning-legal";
import { procurementContracts, purchaseProcesses } from "@/db/schema/procurement-core";
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

test("enforces the expense nature procurement-origin policy on commitments", async () => {
  const [[user], [employee], [year], [budgetUnit], [resourceSource], [secretariat], [alternateSupplier]] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
    db.select({ id: employees.id }).from(employees).limit(1),
    db.select({ id: financialYears.id }).from(financialYears).where(and(eq(financialYears.year, 2026), eq(financialYears.governmentEntityId, "finance-stories-entity"))).limit(1),
    db.select({ id: planningBudgetUnits.id }).from(planningBudgetUnits).limit(1),
    db.select({ id: planningResourceSources.id }).from(planningResourceSources).limit(1),
    db.select({ id: secretariats.id }).from(secretariats).limit(1),
    db.select({ id: suppliers.id }).from(suppliers).where(ne(suppliers.id, "supp-lagoaseca-01")).limit(1),
  ] as const);
  assert.ok(user && employee && year && budgetUnit && resourceSource && secretariat && alternateSupplier, "A fixture deve fornecer os cadastros financeiros e o fornecedor alternativo.");
  const [approver] = await db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), ne(users.id, user.id))).limit(1);
  assert.ok(approver, "A fixture deve fornecer um aprovador diferente do solicitante.");

  const actor: FinanceActor = { usuarioId: user.id, employeeId: employee.id };
  const date = new Date("2026-04-20T10:00:00.000Z");
  const suffix = Date.now().toString();
  const previousAccountingMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  const expenseNatureIds: string[] = [];
  const appropriationIds: string[] = [];
  const expenseIds: string[] = [];
  const reservationIds: string[] = [];
  const commitmentIds: string[] = [];
  const contractIds: string[] = [];
  let purchaseProcessId = "";

  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  try {
    const [purchaseProcess] = await db.insert(purchaseProcesses).values({
        number: `PROC-POL-${suffix}`,
        object: "Processo temporário para política de origem",
        type: "Comum",
        secretariatId: secretariat.id,
    }).returning();
    purchaseProcessId = purchaseProcess.id;
    const createAppropriation = async (policy: "NONE" | "PROCUREMENT_SOURCE" | "CONTRACT") => {
      const expenseNatureId = createId();
      await db.execute(sql`INSERT INTO "ExpenseNature" (id,code,name,"procurementOriginPolicy","updatedAt") VALUES (${expenseNatureId},${`POL-${policy}-${suffix}`},${`Política ${policy}`},${policy}::"ProcurementOriginPolicy",${new Date()})`);
      expenseNatureIds.push(expenseNatureId);
      const [appropriation] = await db.insert(budgetAppropriations).values({
          code: `DOT-POL-${policy}-${suffix}`,
          financialYearId: year.id,
          budgetUnitId: budgetUnit.id,
          expenseNatureId,
          resourceSourceId: resourceSource.id,
          initialValue: 1000,
          initialValueDecimal: new Decimal("1000.00"),
          updatedValue: 1000,
          updatedValueDecimal: new Decimal("1000.00"),
      }).returning();
      appropriationIds.push(appropriation.id);
      return appropriation.id;
    };
    const reserve = async (appropriationId: string, supplierId = "supp-lagoaseca-01") => {
      const expense = await createExpenseRequest(databaseConnection, actor, {
        date,
        description: `Despesa de política de origem ${suffix}`,
        value: "100.00",
        appropriationId,
        supplierId,
        secretariatId: secretariat.id,
        sourceModule: "TEST",
        sourceType: "PROCUREMENT_ORIGIN_POLICY",
        eventType: "TEST",
      });
      expenseIds.push(expense.id);
      await approveExpenseRequest(databaseConnection, { usuarioId: approver.id, employeeId: approver.employeeId }, expense.id);
      const reservation = await createBudgetReservation(databaseConnection, actor, {
        number: `RES-POL-${reservationIds.length}-${suffix}`,
        date,
        value: "100.00",
        appropriationId,
        expenseId: expense.id,
      });
      reservationIds.push(reservation.id);
      return reservation.id;
    };
    const createContract = async (status = "Vigente") => {
      const [contract] = await db.insert(procurementContracts).values({
          number: `CONT-POL-${contractIds.length}-${suffix}`,
          object: "Contrato temporário para política de origem",
          initialValue: 1000,
          updatedValue: 1000,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T23:59:59.999Z"),
          status,
          processId: purchaseProcessId,
          supplierId: "supp-lagoaseca-01",
          secretariatId: secretariat.id,
      }).returning();
      contractIds.push(contract.id);
      return contract;
    };

    const noneAppropriationId = await createAppropriation("NONE");
    const noneReservationId = await reserve(noneAppropriationId);
    const noPolicyCommitment = await createCommitment(databaseConnection, actor, {
      number: `EMP-POL-NONE-${suffix}`,
      date,
      value: "100.00",
      type: "Ordinário",
      history: "Empenho sem exigência de origem",
      appropriationId: noneAppropriationId,
      supplierId: "supp-lagoaseca-01",
      reservationId: noneReservationId,
    });
    commitmentIds.push(noPolicyCommitment.id);

    const contractAppropriationId = await createAppropriation("CONTRACT");
    const contractReservationId = await reserve(contractAppropriationId);
    await assert.rejects(
      () => createCommitment(databaseConnection, actor, {
        number: `EMP-POL-CONTRACT-MISSING-${suffix}`,
        date,
        value: "100.00",
        type: "Ordinário",
        history: "Empenho sem contrato obrigatório",
        appropriationId: contractAppropriationId,
        supplierId: "supp-lagoaseca-01",
        reservationId: contractReservationId,
      }),
      /exige um contrato vigente/i,
    );
    const draftContract = await createContract("Minuta");
    await assert.rejects(
      () => createCommitment(databaseConnection, actor, {
        number: `EMP-POL-CONTRACT-DRAFT-${suffix}`,
        date,
        value: "100.00",
        type: "Ordinário",
        history: "Empenho com contrato não vigente",
        appropriationId: contractAppropriationId,
        supplierId: "supp-lagoaseca-01",
        reservationId: contractReservationId,
        contractId: draftContract.id,
      }),
      /não está vigente/i,
    );
    await db.update(procurementContracts).set({ status: "Vigente" }).where(eq(procurementContracts.id, draftContract.id));
    const contractCommitment = await createCommitment(databaseConnection, actor, {
      number: `EMP-POL-CONTRACT-${suffix}`,
      date,
      value: "100.00",
      type: "Ordinário",
      history: "Empenho com contrato vigente",
      appropriationId: contractAppropriationId,
      supplierId: "supp-lagoaseca-01",
      reservationId: contractReservationId,
      contractId: draftContract.id,
    });
    commitmentIds.push(contractCommitment.id);

    const sourceAppropriationId = await createAppropriation("PROCUREMENT_SOURCE");
    const sourceReservationId = await reserve(sourceAppropriationId);
    await assert.rejects(
      () => createCommitment(databaseConnection, actor, {
        number: `EMP-POL-SOURCE-MISSING-${suffix}`,
        date,
        value: "100.00",
        type: "Ordinário",
        history: "Empenho sem origem de contratação",
        appropriationId: sourceAppropriationId,
        supplierId: "supp-lagoaseca-01",
        reservationId: sourceReservationId,
      }),
      /exige uma origem de contratação válida/i,
    );
    if (alternateSupplier) {
      await assert.rejects(
        () => createCommitment(databaseConnection, actor, {
          number: `EMP-POL-SOURCE-SUPPLIER-${suffix}`,
          date,
          value: "100.00",
          type: "Ordinário",
          history: "Empenho com fornecedor divergente",
          appropriationId: sourceAppropriationId,
          supplierId: alternateSupplier.id,
          reservationId: sourceReservationId,
          contractId: draftContract.id,
        }),
        /não pertence ao fornecedor/i,
      );
    }
    const sourceCommitment = await createCommitment(databaseConnection, actor, {
      number: `EMP-POL-SOURCE-${suffix}`,
      date,
      value: "100.00",
      type: "Ordinário",
      history: "Empenho com origem contratual válida",
      appropriationId: sourceAppropriationId,
      supplierId: "supp-lagoaseca-01",
      reservationId: sourceReservationId,
      contractId: draftContract.id,
    });
    commitmentIds.push(sourceCommitment.id);
  } finally {
    const transactions = commitmentIds.length
      ? await db.select({ id: accountingTransactions.id }).from(accountingTransactions).where(inArray(accountingTransactions.sourceId, commitmentIds))
      : [];
    if (transactions.length) {
      await db.delete(accountingEntries).where(inArray(accountingEntries.transactionId, transactions.map(transaction => transaction.id)));
      await db.delete(accountingTransactions).where(inArray(accountingTransactions.id, transactions.map(transaction => transaction.id)));
    }
    if (commitmentIds.length) await db.delete(financialDocuments).where(inArray(financialDocuments.commitmentId, commitmentIds));
    if (commitmentIds.length) await db.delete(commitments).where(inArray(commitments.id, commitmentIds));
    if (reservationIds.length) await db.delete(budgetReservations).where(inArray(budgetReservations.id, reservationIds));
    if (expenseIds.length) await db.delete(expenses).where(inArray(expenses.id, expenseIds));
    if (contractIds.length) await db.delete(procurementContracts).where(inArray(procurementContracts.id, contractIds));
    if (purchaseProcessId) await db.delete(purchaseProcesses).where(eq(purchaseProcesses.id, purchaseProcessId));
    if (appropriationIds.length) await db.delete(budgetAppropriations).where(inArray(budgetAppropriations.id, appropriationIds));
    if (expenseNatureIds.length) await db.delete(planningExpenseNatures).where(inArray(planningExpenseNatures.id, expenseNatureIds));
    if (previousAccountingMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousAccountingMode;
  }
});
