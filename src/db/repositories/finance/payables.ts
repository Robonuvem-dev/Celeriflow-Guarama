import { and, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { Decimal } from "../../decimal";
import { databaseTimestamp } from "@/db/temporal";
import { payableCarryForwardEvents, payableCarryForwards, payableCarryForwardSettlementLinks } from "../../schema/finance-payables";
import { findFinancialScopeYear } from "./report-scopes";
import { readAnnualAudit } from "./annual-stages";

export async function readPayable(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.id, id));
  if (!row) throw new Error("Resto a pagar não encontrado.");
  return row;
}
export async function findPayableSuccessor(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(payableCarryForwards).where(eq(payableCarryForwards.previousPayableCarryForwardId, id));
  return row ?? null;
}
export async function findPayableRegistration(db: DatabaseExecutor, financialYearId: string, commitmentId: string, type: string) {
  const [row] = await db.select().from(payableCarryForwards).where(and(eq(payableCarryForwards.financialYearId, financialYearId), eq(payableCarryForwards.commitmentId, commitmentId), eq(payableCarryForwards.type, type)));
  return row ?? null;
}
export async function insertPayable(tx: DatabaseTransaction, input: typeof payableCarryForwards.$inferInsert) {
  const [row] = await tx.insert(payableCarryForwards).values(input).returning();
  return row;
}
export async function setPayableStatus(tx: DatabaseTransaction, id: string, status: string) {
  const [row] = await tx.update(payableCarryForwards).set({ status }).where(eq(payableCarryForwards.id, id)).returning();
  if (!row) throw new Error("Resto a pagar não encontrado.");
  return row;
}
export async function insertPayableEvent(tx: DatabaseTransaction, input: typeof payableCarryForwardEvents.$inferInsert) {
  const [row] = await tx.insert(payableCarryForwardEvents).values(input).returning();
  return row;
}
export async function listPayableEvents(db: DatabaseExecutor, filter: { payableCarryForwardId?: string; paymentId?: string; action?: string; paidLegacyOnly?: boolean }) {
  return db.select().from(payableCarryForwardEvents).where(and(filter.payableCarryForwardId ? eq(payableCarryForwardEvents.payableCarryForwardId, filter.payableCarryForwardId) : undefined, filter.paymentId ? eq(payableCarryForwardEvents.paymentId, filter.paymentId) : undefined, filter.action ? eq(payableCarryForwardEvents.action, filter.action) : undefined, filter.paidLegacyOnly ? sql`EXISTS (SELECT 1 FROM "Payment" p WHERE p.id=${payableCarryForwardEvents.paymentId} AND p.status='Paga' AND p."payableCarryForwardId" IS NULL)` : undefined));
}
export async function listPayableSettlementLinks(db: DatabaseExecutor, id: string, activeOnly = false) {
  return db.select().from(payableCarryForwardSettlementLinks).where(and(eq(payableCarryForwardSettlementLinks.payableCarryForwardId, id), activeOnly ? eq(payableCarryForwardSettlementLinks.status, "ACTIVE") : undefined));
}
export async function setPayableSettlementLinkStatus(tx: DatabaseTransaction, id: string, status: string): Promise<void> {
  await tx.update(payableCarryForwardSettlementLinks).set({ status }).where(eq(payableCarryForwardSettlementLinks.payableCarryForwardId, id));
}
export async function insertPayableSettlementLink(tx: DatabaseTransaction, input: typeof payableCarryForwardSettlementLinks.$inferInsert): Promise<void> {
  await tx.insert(payableCarryForwardSettlementLinks).values(input);
}
export async function readPayableYear(db: DatabaseExecutor, id: string) {
  const year = await findFinancialScopeYear(db, id);
  if (!year) throw new Error("Exercício financeiro não encontrado.");
  return year;
}
export async function readPayableOrigin(db: DatabaseExecutor, commitmentId: string) {
  const [row] = (await db.execute<{ budgetUnitId: string; financialYearId: string; resourceSourceId: string; supplierId: string; governmentEntityId: string | null }>(sql`SELECT a."budgetUnitId",a."financialYearId",a."resourceSourceId",c."supplierId",u."governmentEntityId" FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" LEFT JOIN "PlanningEntityUnit" u ON u."budgetUnitId"=a."budgetUnitId" WHERE c.id=${commitmentId}`)).rows;
  if (!row) throw new Error("Empenho da inscrição não encontrado.");
  return row;
}
export async function listPayableActivePayments(db: DatabaseExecutor, id: string) {
  const rows = (await db.execute<{ id: string; status: string; date: Date | string; valueDecimal: string | null }>(sql`SELECT id,status,date,"valueDecimal"::text FROM "Payment" WHERE "payableCarryForwardId"=${id} AND status IN ('Emitida','Paga')`)).rows;
  return rows.map(row => ({ ...row, date: databaseTimestamp(row.date), valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal) }));
}
export async function hasPayableNativeSettlements(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "Settlement" WHERE "payableCarryForwardId"=${id} AND status='Liquidado' LIMIT 1`)).rows.length > 0;
}
export async function readPayableTransportState(db: DatabaseExecutor, id: string) {
  const row = await readPayable(db, id);
  const [financialYear, originFinancialYear, appropriation, inheritedSettlements, nativePayments, events, successorPayableCarryForward] = await Promise.all([readPayableYear(db, row.financialYearId), readPayableYear(db, row.originFinancialYearId), readPayableOrigin(db, row.commitmentId), listPayableSettlementLinks(db, id, true), listPayableActivePayments(db, id), listPayableEvents(db, { payableCarryForwardId: id, action: "PAGAMENTO_RASTREADO", paidLegacyOnly: true }), findPayableSuccessor(db, id)]);
  const paymentIds = events.flatMap(event => event.paymentId ? [event.paymentId] : []);
  const legacyPayments = paymentIds.length ? (await db.execute<{ id: string; date: Date | string }>(sql`SELECT id,date FROM "Payment" WHERE id IN (${sql.join(paymentIds.map(id => sql`${id}`), sql`,`)})`)).rows : [];
  return { ...row, financialYear, originFinancialYear, commitment: { appropriation }, inheritedSettlements, nativePayments, events: events.map(event => ({ ...event, payment: legacyPayments.find(payment => payment.id === event.paymentId) ? { date: databaseTimestamp(legacyPayments.find(payment => payment.id === event.paymentId)!.date) } : null })), successorPayableCarryForward };
}
export async function readInheritedPayableSettlement(db: DatabaseExecutor, payableId: string, settlementId: string) {
  const [link] = await db.select().from(payableCarryForwardSettlementLinks).where(and(eq(payableCarryForwardSettlementLinks.payableCarryForwardId, payableId), eq(payableCarryForwardSettlementLinks.settlementId, settlementId)));
  if (!link) return null;
  const [payable, sourcePayableCarryForward, sourceFinancialYear, transportAudit] = await Promise.all([readPayable(db, payableId), readPayable(db, link.sourcePayableCarryForwardId), readPayableYear(db, link.sourceFinancialYearId), readAnnualAudit(db, link.transportAuditId)]);
  return { ...link, payableCarryForward: { ...payable, financialYear: await readPayableYear(db, payable.financialYearId) }, sourcePayableCarryForward, sourceFinancialYear, transportAudit };
}
export async function listPayableTransportSettlements(db: DatabaseExecutor, parent: { id: string; commitmentId: string; type: string; originFinancialYear: { endDate: Date }; inheritedSettlements: { settlementId: string }[] }) {
  const inherited = parent.inheritedSettlements.map(link => link.settlementId);
  const rows = (await db.execute<{ id: string; date: Date | string; valueDecimal: string | null; executionFinancialYearId: string | null }>(sql`SELECT s.id,s.date,s."valueDecimal"::text,s."executionFinancialYearId" FROM "Settlement" s WHERE s."commitmentId"=${parent.commitmentId} AND s.status='Liquidado' AND (${inherited.length ? sql`s.id IN (${sql.join(inherited.map(id => sql`${id}`), sql`,`)})` : sql`FALSE`} OR ${parent.type === "PROCESSADO" ? sql`s."payableCarryForwardId" IS NULL AND s.date<=${parent.originFinancialYear.endDate}` : sql`s."payableCarryForwardId"=${parent.id}`})`)).rows;
  const ids = rows.map(row => row.id);
  const payments = ids.length ? (await db.execute<{ settlementId: string; status: string; date: Date | string; valueDecimal: string | null }>(sql`SELECT "settlementId",status,date,"valueDecimal"::text FROM "Payment" WHERE "settlementId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)}) AND status IN ('Emitida','Paga')`)).rows : [];
  return Promise.all(rows.map(async row => ({ ...row, date: databaseTimestamp(row.date), valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal), executionFinancialYear: row.executionFinancialYearId ? await readPayableYear(db, row.executionFinancialYearId) : null, payments: payments.filter(payment => payment.settlementId === row.id).map(payment => ({ ...payment, date: databaseTimestamp(payment.date), valueDecimal: payment.valueDecimal === null ? null : new Decimal(payment.valueDecimal) })) })));
}
export async function hasUnlinkedPayableSettlements(db: DatabaseExecutor, parent: { commitmentId: string; type: string; originFinancialYear: { endDate: Date } }, ids: string[]): Promise<boolean> {
  return (await db.execute(sql`SELECT s.id FROM "Settlement" s LEFT JOIN "PayableCarryForward" p ON p.id=s."payableCarryForwardId" WHERE s."commitmentId"=${parent.commitmentId} AND s.status='Liquidado' AND s.date>${parent.originFinancialYear.endDate} AND (s."payableCarryForwardId" IS NULL OR p.type=${parent.type}) ${ids.length ? sql`AND s.id NOT IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})` : sql``} LIMIT 1`)).rows.length > 0;
}
