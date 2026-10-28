import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { payments, paymentRetentions, withholdingPayables } from "../../schema/finance-payments";
import { settlementRetentions } from "../../schema/finance-settlements";
import { financialDocuments } from "../../schema/finance-documents";
import { financialAuditLogs } from "../../schema/finance-identity";
import { findFinanceCommitment } from "./budget-execution";
import { findFinanceSettlement, findSettlementDocument } from "./settlements";

export type PaymentRecord = typeof payments.$inferSelect;
export async function findFinancePayment(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  return row ?? null;
}
export async function readFinancePayment(db: DatabaseExecutor, id: string): Promise<PaymentRecord> {
  const row = await findFinancePayment(db, id);
  if (!row) throw new Error("Pagamento não encontrado.");
  return row;
}
export async function listFinancePayments(db: DatabaseExecutor, ids: string[]): Promise<PaymentRecord[]> {
  if (!ids.length) return [];
  return db.select().from(payments).where(inArray(payments.id, ids)).orderBy(asc(payments.id));
}
export async function listPaymentRetentions(db: DatabaseExecutor, paymentId: string) {
  const rows = await db.select({ retention: paymentRetentions, withholdingPayable: withholdingPayables }).from(paymentRetentions).leftJoin(withholdingPayables, eq(withholdingPayables.retentionId, paymentRetentions.id)).where(eq(paymentRetentions.paymentId, paymentId));
  return rows.map(row => ({ ...row.retention, withholdingPayable: row.withholdingPayable }));
}
export async function readPaymentExecution(db: DatabaseExecutor, id: string) {
  const row = await findFinancePayment(db, id);
  if (!row) return null;
  const [commitment, retentions] = await Promise.all([findFinanceCommitment(db, row.commitmentId), listPaymentRetentions(db, id)]);
  if (!commitment) throw new Error("Empenho do pagamento não encontrado.");
  return { ...row, commitment, retentions };
}
export async function insertFinancePayment(tx: DatabaseTransaction, input: typeof payments.$inferInsert): Promise<PaymentRecord> {
  const [row] = await tx.insert(payments).values(input).returning();
  return row;
}
export async function updateFinancePayment(tx: DatabaseTransaction, id: string, input: Partial<Omit<typeof payments.$inferInsert, "id" | "createdAt">>): Promise<PaymentRecord> {
  const [row] = await tx.update(payments).set(input).where(eq(payments.id, id)).returning();
  if (!row) throw new Error("Pagamento não encontrado.");
  return row;
}
export async function insertPaymentRetention(tx: DatabaseTransaction, input: typeof paymentRetentions.$inferInsert, dueDate?: Date): Promise<void> {
  const [retention] = await tx.insert(paymentRetentions).values(input).returning({ id: paymentRetentions.id });
  await tx.insert(withholdingPayables).values({ retentionId: retention.id, valueDecimal: input.valueDecimal, dueDate });
}
export async function setPaymentWithholdingStatus(tx: DatabaseTransaction, paymentId: string, status: string, previousStatus?: string): Promise<void> {
  await tx.update(withholdingPayables).set({ status }).where(and(sql`${withholdingPayables.retentionId} IN (SELECT id FROM "PaymentRetention" WHERE "paymentId"=${paymentId})`, previousStatus ? eq(withholdingPayables.status, previousStatus) : undefined));
}
export async function readWithholdingExecution(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ payable: withholdingPayables, retention: paymentRetentions }).from(withholdingPayables).innerJoin(paymentRetentions, eq(paymentRetentions.id, withholdingPayables.retentionId)).where(eq(withholdingPayables.id, id));
  if (!row) return null;
  const payment = await readPaymentExecution(db, row.retention.paymentId);
  if (!payment) throw new Error("Pagamento da retenção não encontrado.");
  const [retention] = row.retention.settlementRetentionId ? await db.select().from(settlementRetentions).where(eq(settlementRetentions.id, row.retention.settlementRetentionId)) : [];
  const settlement = retention ? await findFinanceSettlement(db, retention.settlementId) : null;
  const document = settlement?.documentId ? await findSettlementDocument(db, settlement.documentId) : null;
  const settlementMemory = settlement ? { id: settlement.id, documentRef: settlement.documentRef, fiscalDocumentNumber: settlement.fiscalDocumentNumber, fiscalDocumentSeries: settlement.fiscalDocumentSeries, fiscalDocumentIssueDate: settlement.fiscalDocumentIssueDate, fiscalDocumentAccessKey: settlement.fiscalDocumentAccessKey, document: document ? { id: document.id, title: document.title, documentType: document.documentType, status: document.status } : null } : null;
  return { ...row.payable, retention: { ...row.retention, payment, settlementRetention: retention ? { ...retention, settlement: settlementMemory } : null } };
}
export async function markWithholdingPaid(tx: DatabaseTransaction, id: string, receiptDocumentId: string) {
  const [row] = await tx.update(withholdingPayables).set({ status: "Recolhida", receiptDocumentId }).where(eq(withholdingPayables.id, id)).returning();
  if (!row) throw new Error("Retenção não encontrada.");
  return row;
}
export async function listAnnualProgramPayments(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(payments).where(inArray(payments.id, ids)).orderBy(asc(payments.id));
  const [documents, installments] = await Promise.all([
    db.select().from(financialDocuments).where(inArray(financialDocuments.paymentId, ids)),
    db.execute<{ id: string; paymentId: string }>(sql`SELECT id,"paymentId" FROM "InstrumentInstallment" WHERE "paymentId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`),
  ]);
  return Promise.all(rows.map(async row => {
    const commitment = await findFinanceCommitment(db, row.commitmentId);
    if (!commitment) throw new Error("Empenho da programação não encontrado.");
    return { ...row, financialDocument: documents.find(document => document.paymentId === row.id) ?? null, instrumentInstallments: installments.rows.filter(installment => installment.paymentId === row.id), commitment, retentions: await listPaymentRetentions(db, row.id) };
  }));
}
export async function countPaymentTreasuryMovements(db: DatabaseExecutor, paymentId?: string): Promise<number> {
  const [row] = (await db.execute<{ total: number }>(sql`SELECT count(*)::integer AS total FROM "TreasuryMovement" ${paymentId === undefined ? sql`` : sql`WHERE "sourceType"='PAYMENT' AND "sourceId"=${paymentId}`}`)).rows;
  return row.total;
}
export async function findPaymentByBankCorrelation(db: DatabaseExecutor, externalId: string) {
  const [row] = await db.select().from(payments).where(eq(payments.paymentOrderExternalId, externalId));
  return row ?? null;
}
export async function hasPaymentProgramTransport(db: DatabaseExecutor, paymentId: string): Promise<boolean> {
  const [row] = await db.select({ id: financialAuditLogs.id }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ANNUAL_PAYMENT_PROGRAM_COMPLETE"), sql`${financialAuditLogs.payload}->'copies' @> ${JSON.stringify([{ targetPaymentId: paymentId }])}::jsonb`)).limit(1);
  return !!row;
}
