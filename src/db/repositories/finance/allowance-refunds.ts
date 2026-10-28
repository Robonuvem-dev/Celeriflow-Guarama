import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { hrIntegrationEvents } from "../../schema/personnel-workforce";
import { findBudgetReservation, findExpenseRequest } from "./budget-execution";
import { readPaymentExecution } from "./payments";
import { readSettlementPaymentBasis } from "./settlements";
import { findFinanceBankAccount } from "./treasury";
import { findAccountingReplay, findAccountingTransaction, listAccountingEntries } from "./accounting";

export async function readRefundMutationOrigin(db: DatabaseExecutor, id: string, kind: "PAYMENT" | "SETTLEMENT") {
  const table = kind === "PAYMENT" ? sql`"Payment"` : sql`"Settlement"`;
  const [row] = (await db.execute<{ sourceModule: string; sourceType: string; sourceId: string | null }>(sql`SELECT e."sourceModule",e."sourceType",e."sourceId" FROM ${table} f JOIN "Commitment" c ON c.id=f."commitmentId" JOIN "BudgetReservation" r ON r.id=c."reservationId" JOIN "Expense" e ON e.id=r."expenseId" WHERE f.id=${id}`)).rows;
  return row ?? null;
}
export async function findRefundIntegrationEvent(db: DatabaseExecutor, sourceKey: string) {
  const [row] = await db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.sourceKey, sourceKey));
  return row ?? null;
}
export async function hasCollectedTravelRefunds(db: DatabaseExecutor, requestId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "Revenue" WHERE "sourceModule"='RH' AND "sourceType"='TRAVEL_ALLOWANCE_REFUND' AND "sourceId"=${requestId} AND stage='ARRECADADA' AND "reversedAt" IS NULL LIMIT 1`)).rows.length > 0;
}
export async function listAllowanceMutationRefunds(db: DatabaseExecutor, id: string, kind: "PAYMENT" | "SETTLEMENT") {
  const original = kind === "PAYMENT" ? "originalPaymentId" : "originalSettlementId";
  const correction = kind === "PAYMENT" ? "correctionPaymentId" : "correctionSettlementId";
  return db.select().from(hrIntegrationEvents).where(and(inArray(hrIntegrationEvents.eventType, ["ADIANTAMENTO_RESTITUICAO_DESPESA", "ADIANTAMENTO_RESTITUICAO_DESPESA_ESTORNADA", "DIARIA_RESTITUICAO_DESPESA", "DIARIA_RESTITUICAO_DESPESA_ESTORNADA"]), or(sql`${hrIntegrationEvents.payload}->>${original} = ${id}`, sql`${hrIntegrationEvents.payload}->>${correction} = ${id}`)));
}
export async function listCommitmentAllowanceRefunds(db: DatabaseExecutor, commitmentId: string) {
  return db.select().from(hrIntegrationEvents).where(and(inArray(hrIntegrationEvents.eventType, ["ADIANTAMENTO_RESTITUICAO_DESPESA", "DIARIA_RESTITUICAO_DESPESA"]), sql`${hrIntegrationEvents.payload}->>'commitmentId' = ${commitmentId}`));
}
export async function readAllowanceRefundEvent(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.id, id));
  if (!row) throw new Error("Restituição não encontrada.");
  return row;
}
export async function setAllowanceRefundEventStatus(tx: DatabaseTransaction, id: string, status: string) {
  const [row] = await tx.update(hrIntegrationEvents).set({ status }).where(eq(hrIntegrationEvents.id, id)).returning();
  if (!row) throw new Error("Restituição não encontrada.");
  return row;
}
export async function listRequestExpenseRefunds(db: DatabaseExecutor, kind: "DIARIA" | "ADIANTAMENTO", requestId: string) {
  return db.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, `${kind}_RESTITUICAO_DESPESA`), sql`${hrIntegrationEvents.payload}#>>'{input,requestId}' = ${requestId}`));
}
export async function readAllowanceRefundPayment(db: DatabaseExecutor, id: string) {
  const row = await readPaymentExecution(db, id);
  if (!row) throw new Error("Pagamento não encontrado.");
  const [settlement, bankAccount, reservation] = await Promise.all([
    row.settlementId ? readSettlementPaymentBasis(db, row.settlementId) : null,
    findFinanceBankAccount(db, row.bankAccountId),
    row.commitment.reservationId ? findBudgetReservation(db, row.commitment.reservationId) : null,
  ]);
  if (!bankAccount) throw new Error("Conta bancária não encontrada.");
  const expense = reservation?.expenseId ? await findExpenseRequest(db, { id: reservation.expenseId }) : null;
  return { ...row, settlement, bankAccount, commitment: { ...row.commitment, reservation: reservation ? { ...reservation, expense } : null } };
}
export async function readRefundAccountingTransaction(db: DatabaseExecutor, filter: { id: string } | { idempotencyKey: string }) {
  const row = "id" in filter ? await findAccountingTransaction(db, filter.id) : await findAccountingReplay(db, filter.idempotencyKey);
  if (!row) throw new Error("Partida original não encontrada para recomposição.");
  return { ...row, entries: await listAccountingEntries(db, row.id) };
}
