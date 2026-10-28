import { and, count, eq, lt, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { Decimal } from "../../decimal";
import { databaseTimestamp } from "@/db/temporal";
import { accountingTransactions } from "../../schema/finance-accounting";

export async function listPreparedProgramPayments(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  const rows = (await db.execute<{ id: string; status: string; bankStatus: string | null; bankTransactionId: string | null; bankProcessedAt: string | Date | null; valueDecimal: string | null; netValueDecimal: string | null; settlementId: string | null; bankAccountId: string; executionFinancialYearId: string | null; payableCarryForwardId: string | null; paymentOrderExternalId: string | null; integrationEventId: string | null; date: string | Date }>(sql`SELECT id,status,"bankStatus","bankTransactionId","bankProcessedAt","valueDecimal"::text,"netValueDecimal"::text,"settlementId","bankAccountId","executionFinancialYearId","payableCarryForwardId","paymentOrderExternalId","integrationEventId",date FROM "Payment" WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)}) AND status='Emitida'`)).rows;
  return rows.map(row => ({ ...row, date: databaseTimestamp(row.date), bankProcessedAt: row.bankProcessedAt === null ? null : databaseTimestamp(row.bankProcessedAt), valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal), netValueDecimal: row.netValueDecimal === null ? null : new Decimal(row.netValueDecimal) }));
}
export async function readAccountingPendingCounts(db: DatabaseExecutor, financialYearId: string, year: { startDate: Date; governmentEntityId: string | null }, nextMonth: Date, preparedPrograms: string[]) {
  const [drafts, payments, reconciliations] = await Promise.all([
    db.select({ total: count() }).from(accountingTransactions).where(and(eq(accountingTransactions.financialYearId, financialYearId), eq(accountingTransactions.status, "RASCUNHO"), lt(accountingTransactions.date, nextMonth))),
    db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "Payment" p JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE p.status='Emitida' AND p.date>=${year.startDate} AND p.date<${nextMonth} AND (p."executionFinancialYearId"=${financialYearId} OR (p."executionFinancialYearId" IS NULL AND a."financialYearId"=${financialYearId})) ${preparedPrograms.length ? sql`AND p.id NOT IN (${sql.join(preparedPrograms.map(id => sql`${id}`), sql`,`)})` : sql``}`),
    db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "BankStatementItem" i WHERE i.status IN ('Pendente','Parcial') AND i.date>=${year.startDate} AND i.date<${nextMonth} ${year.governmentEntityId ? sql`AND (
      EXISTS (SELECT 1 FROM "BankAccount" b JOIN "PlanningEntityUnit" u ON u."budgetUnitId"=b."budgetUnitId" WHERE b.id=i."bankAccountId" AND u."governmentEntityId"=${year.governmentEntityId})
      OR (i."bankAccountId" IS NULL AND EXISTS (SELECT 1 FROM "BankStatementImport" s JOIN "BankAccount" b ON b.id=s."bankAccountId" JOIN "PlanningEntityUnit" u ON u."budgetUnitId"=b."budgetUnitId" WHERE s.id=i."statementImportId" AND u."governmentEntityId"=${year.governmentEntityId}))
      OR (i."bankAccountId" IS NULL AND i."statementImportId" IS NULL))` : sql``}`),
  ]);
  const draftTransactions = drafts[0].total, emittedPayments = payments.rows[0].total, openReconciliations = reconciliations.rows[0].total;
  return { draftTransactions, emittedPayments, openReconciliations, total: draftTransactions + emittedPayments + openReconciliations };
}
