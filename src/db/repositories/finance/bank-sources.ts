import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import { Decimal } from "../../decimal";
import { databaseTimestamp } from "@/db/temporal";

export async function readBankSourceAccount(db: DatabaseExecutor, id: string) {
  const [account] = await db.select({ id: reconciliationBankAccounts.id, budgetUnitId: reconciliationBankAccounts.budgetUnitId, resourceSourceId: reconciliationBankAccounts.resourceSourceId }).from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, id));
  if (!account) throw new Error("Conta bancária não encontrada.");
  const permittedSources = (await db.execute<{ resourceSourceId: string; isActive: boolean }>(sql`SELECT "resourceSourceId","isActive" FROM "BankAccountResourceSource" WHERE "bankAccountId"=${id}`)).rows;
  return { ...account, permittedSources };
}
export async function hasUndocumentedBankSources(db: DatabaseExecutor, bankAccountId: string, throughDate?: Date, confirmedOnly = true): Promise<boolean> {
  const [row] = await db.select({ id: reconciliationTreasuryMovements.id }).from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.bankAccountId, bankAccountId), isNull(reconciliationTreasuryMovements.resourceSourceId), confirmedOnly ? eq(reconciliationTreasuryMovements.status, "Confirmado") : undefined, throughDate ? lte(reconciliationTreasuryMovements.date, throughDate) : undefined)).limit(1);
  return !!row;
}
export async function listBankSourceMovements(db: DatabaseExecutor, bankAccountId: string, resourceSourceId: string, period: { through?: Date; after?: Date } = {}) {
  return db.select({ date: reconciliationTreasuryMovements.date, direction: reconciliationTreasuryMovements.direction, valueDecimal: reconciliationTreasuryMovements.valueDecimal }).from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.bankAccountId, bankAccountId), eq(reconciliationTreasuryMovements.resourceSourceId, resourceSourceId), eq(reconciliationTreasuryMovements.status, "Confirmado"), period.through ? lte(reconciliationTreasuryMovements.date, period.through) : undefined, period.after ? gt(reconciliationTreasuryMovements.date, period.after) : undefined));
}
export async function listBankSourceRedistributions(db: DatabaseExecutor, bankAccountId: string, resourceSourceId: string, period: { through?: Date; after?: Date } = {}) {
  const rows = (await db.execute<{ date: string | Date; sourceResourceSourceId: string; valueDecimal: string }>(sql`SELECT s.date,s."sourceResourceSourceId",s."valueDecimal"::text FROM "RevenueResourceRedistribution" s JOIN "Revenue" r ON r.id=s."revenueId" WHERE r."bankAccountId"=${bankAccountId} AND (s."sourceResourceSourceId"=${resourceSourceId} OR s."destinationResourceSourceId"=${resourceSourceId}) ${period.through ? sql`AND s.date<=${period.through}` : sql``} ${period.after ? sql`AND s.date>${period.after}` : sql``}`)).rows;
  return rows.map(row => ({ ...row, date: databaseTimestamp(row.date), valueDecimal: new Decimal(row.valueDecimal) }));
}
export async function countKnownBankSources(db: DatabaseExecutor, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return (await db.execute(sql`SELECT id FROM "ResourceSource" WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`)).rows.length;
}
export async function hasPendingSourcePayment(db: DatabaseExecutor, bankAccountId: string, sourceId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT p.id FROM "Payment" p JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE p."bankAccountId"=${bankAccountId} AND p.status='Emitida' AND a."resourceSourceId"=${sourceId} LIMIT 1`)).rows.length > 0;
}
export async function hasPendingSourceWithholding(db: DatabaseExecutor, bankAccountId: string, sourceId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT w.id FROM "WithholdingPayable" w JOIN "PaymentRetention" r ON r.id=w."retentionId" JOIN "Payment" p ON p.id=r."paymentId" JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE w.status='Pendente' AND p."bankAccountId"=${bankAccountId} AND a."resourceSourceId"=${sourceId} LIMIT 1`)).rows.length > 0;
}
export async function replaceBankSourcePermissions(tx: DatabaseTransaction, bankAccountId: string, resourceSourceIds: string[]): Promise<void> {
  await tx.execute(sql`UPDATE "BankAccountResourceSource" SET "isActive"=false,"updatedAt"=${new Date()} WHERE "bankAccountId"=${bankAccountId}`);
  for (const id of resourceSourceIds) await tx.execute(sql`INSERT INTO "BankAccountResourceSource" ("bankAccountId","resourceSourceId","isActive","updatedAt") VALUES (${bankAccountId},${id},true,${new Date()}) ON CONFLICT ("bankAccountId","resourceSourceId") DO UPDATE SET "isActive"=true,"updatedAt"=EXCLUDED."updatedAt"`);
}
