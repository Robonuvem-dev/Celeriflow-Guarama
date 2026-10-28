import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { Decimal } from "../../decimal";
import { createId } from "../../ids";
import { databaseTimestamp } from "@/db/temporal";
import { accountingEntries, accountingPlans, accountingTransactions, monthlyAccountingCloses } from "../../schema/finance-accounting";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import { listBudgetCommitments, readBudgetAppropriation } from "./budget-execution";

export type AnnualCommitment = {
  id: string; valueDecimal: Decimal | null; appropriation: { budgetUnitId: string; resourceSourceId: string };
  movements: { type: string; valueDecimal: Decimal | null }[]; settlements: { valueDecimal: Decimal | null }[]; payments: { valueDecimal: Decimal | null }[];
};
export type AnnualPayable = {
  id: string; financialYearId: string; originFinancialYearId: string; commitmentId: string; type: string; status: string; valueDecimal: Decimal;
  originFinancialYear: { governmentEntityId: string | null }; commitment: { appropriation: { financialYearId: string; budgetUnitId: string; resourceSourceId: string } };
  events: { action: string }[]; nativePayments: { id: string }[]; nativeSettlements: { id: string }[]; successorPayableCarryForward: { id: string } | null;
};
const decimal = (value: string | null) => value === null ? null : new Decimal(value);

/** The cutoff is used only by RAP apuração. Consistency diagnostics inspect all execution. */
export async function listAnnualCommitments(db: DatabaseExecutor, financialYearId: string, through?: Date): Promise<AnnualCommitment[]> {
  const rows = (await db.execute<{ id: string; valueDecimal: string | null; budgetUnitId: string; resourceSourceId: string }>(sql`SELECT c.id,c."valueDecimal"::text,a."budgetUnitId",a."resourceSourceId" FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE a."financialYearId"=${financialYearId} AND c.status IN ('Emitido','Liquidado','Pago') ${through ? sql`AND c.date<=${through}` : sql``}`)).rows;
  if (!rows.length) return [];
  const ids = sql.join(rows.map(row => sql`${row.id}`), sql`,`);
  const [movements, settlements, payments] = await Promise.all([
    db.execute<{ commitmentId: string; type: string; valueDecimal: string | null }>(sql`SELECT "commitmentId",type,"valueDecimal"::text FROM "CommitmentMovement" WHERE "commitmentId" IN (${ids}) ${through ? sql`AND date<=${through}` : sql``}`),
    db.execute<{ commitmentId: string; valueDecimal: string | null }>(sql`SELECT "commitmentId","valueDecimal"::text FROM "Settlement" WHERE "commitmentId" IN (${ids}) AND status='Liquidado' AND "payableCarryForwardId" IS NULL ${through ? sql`AND date<=${through}` : sql``}`),
    db.execute<{ commitmentId: string; valueDecimal: string | null }>(sql`SELECT "commitmentId","valueDecimal"::text FROM "Payment" WHERE "commitmentId" IN (${ids}) AND status='Paga' AND "payableCarryForwardId" IS NULL ${through ? sql`AND date<=${through}` : sql``}`),
  ]);
  return rows.map(row => ({ id: row.id, valueDecimal: decimal(row.valueDecimal), appropriation: { budgetUnitId: row.budgetUnitId, resourceSourceId: row.resourceSourceId }, movements: movements.rows.filter(item => item.commitmentId === row.id).map(item => ({ type: item.type, valueDecimal: decimal(item.valueDecimal) })), settlements: settlements.rows.filter(item => item.commitmentId === row.id).map(item => ({ valueDecimal: decimal(item.valueDecimal) })), payments: payments.rows.filter(item => item.commitmentId === row.id).map(item => ({ valueDecimal: decimal(item.valueDecimal) })) }));
}

export async function listAnnualPayables(db: DatabaseExecutor, financialYearId: string, filter: { originalOnly?: boolean; pendingOnly?: boolean } = {}): Promise<AnnualPayable[]> {
  const rows = (await db.execute<{ id: string; financialYearId: string; originFinancialYearId: string; commitmentId: string; type: string; status: string; valueDecimal: string; governmentEntityId: string | null; appropriationYearId: string; budgetUnitId: string; resourceSourceId: string; successorId: string | null }>(sql`
    SELECT p.id,p."financialYearId",p."originFinancialYearId",p."commitmentId",p.type,p.status,p."valueDecimal"::text,y."governmentEntityId",a."financialYearId" AS "appropriationYearId",a."budgetUnitId",a."resourceSourceId",s.id AS "successorId"
    FROM "PayableCarryForward" p JOIN "FinancialYear" y ON y.id=p."originFinancialYearId" JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" LEFT JOIN "PayableCarryForward" s ON s."previousPayableCarryForwardId"=p.id
    WHERE p."financialYearId"=${financialYearId} ${filter.originalOnly ? sql`AND p."originFinancialYearId"=${financialYearId}` : sql``} ${filter.pendingOnly ? sql`AND p.status='PENDENTE'` : sql``} ORDER BY p.id ASC`)).rows;
  if (!rows.length) return [];
  const ids = sql.join(rows.map(row => sql`${row.id}`), sql`,`);
  const [events, payments, settlements] = await Promise.all([
    db.execute<{ payableCarryForwardId: string; action: string }>(sql`SELECT "payableCarryForwardId",action FROM "PayableCarryForwardEvent" WHERE "payableCarryForwardId" IN (${ids})`),
    db.execute<{ id: string; payableCarryForwardId: string }>(sql`SELECT id,"payableCarryForwardId" FROM "Payment" WHERE "payableCarryForwardId" IN (${ids})`),
    db.execute<{ id: string; payableCarryForwardId: string }>(sql`SELECT id,"payableCarryForwardId" FROM "Settlement" WHERE "payableCarryForwardId" IN (${ids})`),
  ]);
  return rows.map(row => ({ id: row.id, financialYearId: row.financialYearId, originFinancialYearId: row.originFinancialYearId, commitmentId: row.commitmentId, type: row.type, status: row.status, valueDecimal: new Decimal(row.valueDecimal), originFinancialYear: { governmentEntityId: row.governmentEntityId }, commitment: { appropriation: { financialYearId: row.appropriationYearId, budgetUnitId: row.budgetUnitId, resourceSourceId: row.resourceSourceId } }, events: events.rows.filter(item => item.payableCarryForwardId === row.id).map(item => ({ action: item.action })), nativePayments: payments.rows.filter(item => item.payableCarryForwardId === row.id).map(item => ({ id: item.id })), nativeSettlements: settlements.rows.filter(item => item.payableCarryForwardId === row.id).map(item => ({ id: item.id })), successorPayableCarryForward: row.successorId ? { id: row.successorId } : null }));
}
export async function insertAnnualPayable(tx: DatabaseTransaction, input: { financialYearId: string; commitmentId: string; type: string; valueDecimal: Decimal }): Promise<{ id: string }> {
  const id = createId();
  await tx.execute(sql`INSERT INTO "PayableCarryForward" (id,"financialYearId","originFinancialYearId","commitmentId",type,"valueDecimal","updatedAt") VALUES (${id},${input.financialYearId},${input.financialYearId},${input.commitmentId},${input.type},${input.valueDecimal.toString()},${new Date()})`);
  return { id };
}
export async function updateAnnualPayable(tx: DatabaseTransaction, id: string, status: string, value?: Decimal): Promise<void> {
  await tx.execute(sql`UPDATE "PayableCarryForward" SET status=${status},"updatedAt"=${new Date()} ${value === undefined ? sql`` : sql`,"valueDecimal"=${value.toString()}`} WHERE id=${id}`);
}
export async function insertAnnualPayableEvent(tx: DatabaseTransaction, input: { payableCarryForwardId: string; action: string; justification: string; actorUsuarioId: string; valueDecimal: Decimal }): Promise<void> {
  await tx.execute(sql`INSERT INTO "PayableCarryForwardEvent" (id,"payableCarryForwardId",action,justification,"actorUsuarioId","valueDecimal") VALUES (${createId()},${input.payableCarryForwardId},${input.action},${input.justification},${input.actorUsuarioId},${input.valueDecimal.toString()})`);
}
export async function listAnnualMonths(db: DatabaseExecutor, financialYearId: string) {
  return db.select({ competence: monthlyAccountingCloses.competence, status: monthlyAccountingCloses.status }).from(monthlyAccountingCloses).where(eq(monthlyAccountingCloses.financialYearId, financialYearId));
}
export async function listAnnualConsistencyPostings(db: DatabaseExecutor, financialYearId: string) {
  const postings = await db.select().from(accountingTransactions).where(eq(accountingTransactions.financialYearId, financialYearId)).orderBy(asc(accountingTransactions.id));
  const entries = await db.select({ entry: accountingEntries, account: { type: accountingPlans.type } }).from(accountingEntries).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).innerJoin(accountingTransactions, eq(accountingTransactions.id, accountingEntries.transactionId)).where(eq(accountingTransactions.financialYearId, financialYearId));
  return postings.map(posting => ({ ...posting, entries: entries.filter(({ entry }) => entry.transactionId === posting.id).map(({ entry, account }) => ({ ...entry, account })) }));
}
export async function listAnnualConsistencyCash(db: DatabaseExecutor, unitIds: string[], through: Date) {
  if (!unitIds.length) return [];
  const rows = await db.select({ movement: { id: reconciliationTreasuryMovements.id, date: reconciliationTreasuryMovements.date, resourceSourceId: reconciliationTreasuryMovements.resourceSourceId, valueDecimal: reconciliationTreasuryMovements.valueDecimal, direction: reconciliationTreasuryMovements.direction }, bankAccount: { budgetUnitId: reconciliationBankAccounts.budgetUnitId } }).from(reconciliationTreasuryMovements).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, reconciliationTreasuryMovements.bankAccountId)).where(and(eq(reconciliationTreasuryMovements.status, "Confirmado"), sql`${reconciliationBankAccounts.budgetUnitId} IN (${sql.join(unitIds.map(id => sql`${id}`), sql`,`)})`, sql`${reconciliationTreasuryMovements.date}<=${through}`));
  return rows.map(({ movement, bankAccount }) => ({ ...movement, bankAccount }));
}
export async function listEstimativeAppropriations(db: DatabaseExecutor, financialYearId: string) {
  return (await db.execute<{ id: string }>(sql`SELECT a.id FROM "BudgetAppropriation" a WHERE a."financialYearId"=${financialYearId} AND EXISTS (SELECT 1 FROM "Commitment" c WHERE c."appropriationId"=a.id AND c.type='Estimativo') ORDER BY a.id`)).rows;
}
export async function listAnnualEstimativeCommitments(db: DatabaseExecutor, financialYearId: string) {
  const commitments = (await listBudgetCommitments(db, { financialYearId })).filter(row => row.type === "Estimativo").sort((a, b) => a.id.localeCompare(b.id));
  if (!commitments.length) return [];
  const ids = sql.join(commitments.map(row => sql`${row.id}`), sql`, `);
  const [settlements, payments] = await Promise.all([
    db.execute<{ commitmentId: string; date: Date | string; payableCarryForwardId: string | null; valueDecimal: string | null }>(sql`SELECT "commitmentId",date,"payableCarryForwardId","valueDecimal"::text FROM "Settlement" WHERE "commitmentId" IN (${ids}) AND status='Liquidado'`),
    db.execute<{ commitmentId: string; date: Date | string; payableCarryForwardId: string | null; valueDecimal: string | null }>(sql`SELECT "commitmentId",date,"payableCarryForwardId","valueDecimal"::text FROM "Payment" WHERE "commitmentId" IN (${ids}) AND status IN ('Emitida','Paga')`),
  ]);
  const execution = (rows: typeof settlements.rows, id: string) => rows.filter(row => row.commitmentId === id).map(row => ({ ...row, date: databaseTimestamp(row.date), valueDecimal: decimal(row.valueDecimal) }));
  return Promise.all(commitments.map(async row => ({ ...row, appropriation: await readBudgetAppropriation(db, row.appropriationId), settlements: execution(settlements.rows, row.id), payments: execution(payments.rows, row.id) })));
}
