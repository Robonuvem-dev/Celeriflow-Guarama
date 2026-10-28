import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { createFinanceLegacyStoriesFixture } from "../../../../tests/helpers/finance-legacy-stories-fixture";
import { Decimal } from "@/db/decimal";
import { users } from "@/db/schema/identity";
import { financialYears } from "@/db/schema/finance-years";
import { annualAccountingCloses, monthlyAccountingCloses, monthlyAccountingCloseEvents } from "@/db/schema/finance-accounting";
import { commitments } from "@/db/schema/finance-budget";
import { payments } from "@/db/schema/finance-payments";
import { payableCarryForwardEvents, payableCarryForwards } from "@/db/schema/finance-payables";
import {
  authorizeAccountingMonthClose,
  authorizeAccountingMonthReopen,
  cancelPayableCarryForward,
  finalizeAnnualAccountingClose,
  FinanceActor,
  prepareAnnualAccountingClose,
  reregisterPayableCarryForward,
  requestAccountingMonthClose,
  requestAccountingMonthReopen,
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

describe("accounting close workflow", () => {
  const yearNumber = 2099;
  let financialYearId = "";
  let reregisteredFinancialYearId = "";
  let requester: FinanceActor;
  let authorizer: FinanceActor;

  test("requires separate authorization and retains monthly reopening evidence", async () => {
    const activeUsers = await db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(eq(users.ativo, true)).limit(2);
    assert.equal(activeUsers.length, 2, "A base de teste deve possuir dois usuarios ativos");
    requester = { usuarioId: activeUsers[0].id, employeeId: activeUsers[0].employeeId };
    authorizer = { usuarioId: activeUsers[1].id, employeeId: activeUsers[1].employeeId };
    const existing = await db.select({ id: financialYears.id }).from(financialYears).where(and(eq(financialYears.year, yearNumber), eq(financialYears.governmentEntityId, "finance-stories-entity"))).limit(1);
    assert.equal(existing.length, 0, `O exercicio de teste ${yearNumber} ja existe`);
    const [year] = await db.insert(financialYears).values({ year: yearNumber, governmentEntityId: "finance-stories-entity", status: "Aberto", startDate: new Date(`${yearNumber}-01-01T00:00:00.000Z`), endDate: new Date(`${yearNumber}-12-31T23:59:59.999Z`) }).returning();
    financialYearId = year.id;
    const january = new Date(`${yearNumber}-01-01T00:00:00.000Z`);

    await requestAccountingMonthClose(databaseConnection, requester, financialYearId, january);
    await assert.rejects(() => authorizeAccountingMonthClose(databaseConnection, requester, financialYearId, january), /solicitante nao pode autorizar/i);
    await authorizeAccountingMonthClose(databaseConnection, authorizer, financialYearId, january);
    await requestAccountingMonthReopen(databaseConnection, requester, financialYearId, january, "Correcao contabil documentada.");
    await assert.rejects(() => authorizeAccountingMonthReopen(databaseConnection, requester, financialYearId, january), /solicitante nao pode autorizar/i);
    await authorizeAccountingMonthReopen(databaseConnection, authorizer, financialYearId, january);

    const [reopened] = await db.select().from(monthlyAccountingCloses).where(and(eq(monthlyAccountingCloses.financialYearId, financialYearId), eq(monthlyAccountingCloses.competence, january)));
    assert.ok(reopened);
    const events = await db.select().from(monthlyAccountingCloseEvents).where(eq(monthlyAccountingCloseEvents.monthlyAccountingCloseId, reopened.id)).orderBy(asc(monthlyAccountingCloseEvents.createdAt));
    assert.equal(reopened.status, "ABERTO");
    assert.equal(events.filter((event) => event.action === "CLOSE_AUTHORIZED").length, 1);
    assert.equal(events.find((event) => event.action === "REOPEN_REQUESTED")?.justification, "Correcao contabil documentada.");
    assert.ok(events.find((event) => event.action === "REOPEN_REQUESTED")?.closureEvidence, "A reabertura deve registrar a evidencia do fechamento anterior");
  });

  test("finalizes an annual close only after twelve current closed months", async () => {
    assert.ok(financialYearId);
    for (let month = 0; month < 12; month += 1) {
      const competence = new Date(Date.UTC(yearNumber, month, 1));
      const [close] = await db.select().from(monthlyAccountingCloses).where(and(eq(monthlyAccountingCloses.financialYearId, financialYearId), eq(monthlyAccountingCloses.competence, competence)));
      if (!close || close.status === "ABERTO") await requestAccountingMonthClose(databaseConnection, requester, financialYearId, competence);
      await authorizeAccountingMonthClose(databaseConnection, authorizer, financialYearId, competence);
    }
    await prepareAnnualAccountingClose(databaseConnection, requester, financialYearId);
    await assert.rejects(() => finalizeAnnualAccountingClose(databaseConnection, requester, financialYearId), /quem preparou.*nao pode conclui-lo/i);
    await finalizeAnnualAccountingClose(databaseConnection, authorizer, financialYearId);
    const [year] = await db.select().from(financialYears).where(eq(financialYears.id, financialYearId));
    const [annual] = await db.select().from(annualAccountingCloses).where(eq(annualAccountingCloses.financialYearId, financialYearId));
    assert.ok(year && annual);
    assert.equal(year.status, "Encerrado");
    assert.equal(annual.status, "ENCERRADO");
    assert.equal(annual.closedByUsuarioId, authorizer.usuarioId);
    assert.ok(annual.closedAt);
  });

  test("records RAP cancellation and re-registration without creating a payment", async () => {
    assert.ok(financialYearId);
    const [commitment] = await db.select({ id: commitments.id }).from(commitments).limit(1);
    assert.ok(commitment, "A base de teste deve possuir um empenho para a relação do RAP");
    const paymentCount = async () => (await db.select({ total: count() }).from(payments).where(eq(payments.commitmentId, commitment.id)))[0].total;
    const paymentCountBefore = await paymentCount();
    const [targetYear] = await db.insert(financialYears).values({ year: 2100, governmentEntityId: "finance-stories-entity", status: "Aberto", startDate: new Date("2100-01-01T00:00:00.000Z"), endDate: new Date("2100-12-31T23:59:59.999Z") }).returning();
    reregisteredFinancialYearId = targetYear.id;
    const [cancelledCandidate, reregisteredCandidate] = await db.insert(payableCarryForwards).values([
      { financialYearId, originFinancialYearId: financialYearId, commitmentId: commitment.id, valueDecimal: new Decimal("10.00"), type: "PROCESSADO" },
      { financialYearId, originFinancialYearId: financialYearId, commitmentId: commitment.id, valueDecimal: new Decimal("20.00"), type: "NAO_PROCESSADO" },
    ]).returning();

    await cancelPayableCarryForward(databaseConnection, requester, { payableCarryForwardId: cancelledCandidate.id, justification: "Cancelamento interno de teste." });
    const [cancelled] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.id, cancelledCandidate.id));
    const cancelledEvents = await db.select().from(payableCarryForwardEvents).where(eq(payableCarryForwardEvents.payableCarryForwardId, cancelledCandidate.id));
    assert.equal(cancelled.status, "CANCELADO");
    assert.equal(cancelledEvents[0]?.action, "CANCELAMENTO_REGISTRADO");

    const successor = await reregisterPayableCarryForward(databaseConnection, requester, { payableCarryForwardId: reregisteredCandidate.id, targetFinancialYearId: targetYear.id, justification: "Reinscrição interna de teste." });
    const [source] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.id, reregisteredCandidate.id));
    const [persistedSuccessor] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.id, successor.id));
    const successorEvents = await db.select().from(payableCarryForwardEvents).where(eq(payableCarryForwardEvents.payableCarryForwardId, successor.id));
    assert.equal(source.status, "REINSCRITO");
    assert.equal(persistedSuccessor.previousPayableCarryForwardId, source.id);
    assert.equal(persistedSuccessor.originFinancialYearId, financialYearId);
    assert.equal(successorEvents[0]?.action, "REINSCRICAO_RECEBIDA");
    assert.equal(await paymentCount(), paymentCountBefore);
  });

  after(async () => {
    if (!financialYearId) return;
    const yearIds = reregisteredFinancialYearId ? [financialYearId, reregisteredFinancialYearId] : [financialYearId];
    const payableIds = db.select({ id: payableCarryForwards.id }).from(payableCarryForwards).where(inArray(payableCarryForwards.financialYearId, yearIds));
    await db.delete(payableCarryForwardEvents).where(inArray(payableCarryForwardEvents.payableCarryForwardId, payableIds));
    await db.delete(payableCarryForwards).where(inArray(payableCarryForwards.financialYearId, yearIds));
    await db.delete(annualAccountingCloses).where(eq(annualAccountingCloses.financialYearId, financialYearId));
    const closeIds = db.select({ id: monthlyAccountingCloses.id }).from(monthlyAccountingCloses).where(eq(monthlyAccountingCloses.financialYearId, financialYearId));
    await db.delete(monthlyAccountingCloseEvents).where(inArray(monthlyAccountingCloseEvents.monthlyAccountingCloseId, closeIds));
    await db.delete(monthlyAccountingCloses).where(eq(monthlyAccountingCloses.financialYearId, financialYearId));
    await db.delete(financialYears).where(inArray(financialYears.id, yearIds));
  });
});
