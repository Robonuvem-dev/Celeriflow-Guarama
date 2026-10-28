import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";

// Explicit read projections for RH's native finance integration. All writes
// remain in Finance's transactional writers, on the caller's same connection.
const at = (value: Date | string) => value instanceof Date ? value : new Date(value);
const amount = (value: string | null) => value === null ? null : new Decimal(value);

export async function requirePersonnelAppropriation(db: DatabaseExecutor, id: string) {
  const { rows: [row] } = await db.execute<{ id: string; budgetUnitId: string; financialYearId: string; secretariatId: string }>(sql`SELECT a.id, a."budgetUnitId", a."financialYearId", u."secretariatId" FROM "BudgetAppropriation" a JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" WHERE a.id=${id}`);
  if (!row) throw new Error("Dotação não encontrada.");
  return row;
}
export async function requirePersonnelEntityUnit(db: DatabaseExecutor, budgetUnitId: string) {
  const { rows: [row] } = await db.execute<{ budgetUnitId: string; governmentEntityId: string }>(sql`SELECT "budgetUnitId", "governmentEntityId" FROM "PlanningEntityUnit" WHERE "budgetUnitId"=${budgetUnitId}`);
  if (!row) throw new Error("Vinculação da UG não encontrada.");
  return row;
}
export async function listPersonnelEntityUnits(db: DatabaseExecutor, governmentEntityId: string) {
  return (await db.execute<{ budgetUnitId: string; secretariatId: string }>(sql`SELECT p."budgetUnitId", u."secretariatId" FROM "PlanningEntityUnit" p JOIN "BudgetUnit" u ON u.id=p."budgetUnitId" WHERE p."governmentEntityId"=${governmentEntityId}`)).rows;
}
export async function requirePersonnelFinancialYear(db: DatabaseExecutor, governmentEntityId: string, year: number) {
  const { rows: [row] } = await db.execute<{ id: string; year: number; governmentEntityId: string }>(sql`SELECT id, year, "governmentEntityId" FROM "FinancialYear" WHERE "governmentEntityId"=${governmentEntityId} AND year=${year} LIMIT 1`);
  if (!row) throw new Error("Exercício financeiro não encontrado.");
  return row;
}
export async function requirePersonnelBank(db: DatabaseExecutor, id: string) {
  const { rows: [row] } = await db.execute<{ id: string; budgetUnitId: string | null; isActive: boolean }>(sql`SELECT id, "budgetUnitId", "isActive" FROM "BankAccount" WHERE id=${id}`);
  if (!row) throw new Error("Conta bancária não encontrada.");
  return row;
}

type ChainRow = { id: string; number: string; date: Date | string; status: string; value: number; valueDecimal: string | null; appropriationId: string; supplierId: string; reservationId: string | null; budgetUnitId: string; financialYearId: string; year: number; governmentEntityId: string | null; expenseId: string | null; sourceModule: string | null; sourceType: string | null; sourceId: string | null; expenseStatus: string | null; expenseAppropriationId: string | null; expenseSupplierId: string | null; expenseValueDecimal: string | null };
export async function requirePersonnelCommitment(db: DatabaseExecutor, id: string) {
  const { rows: [row] } = await db.execute<ChainRow>(sql`SELECT c.id,c.number,c.date,c.status,c.value,c."valueDecimal"::text,c."appropriationId",c."supplierId",c."reservationId",a."budgetUnitId",a."financialYearId",y.year,y."governmentEntityId",r."expenseId",e."sourceModule",e."sourceType",e."sourceId",e.status AS "expenseStatus",e."appropriationId" AS "expenseAppropriationId",e."supplierId" AS "expenseSupplierId",e."valueDecimal"::text AS "expenseValueDecimal"
    FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" JOIN "FinancialYear" y ON y.id=a."financialYearId" LEFT JOIN "BudgetReservation" r ON r.id=c."reservationId" LEFT JOIN "Expense" e ON e.id=r."expenseId" WHERE c.id=${id}`);
  if (!row) throw new Error("Empenho não encontrado.");
  const movements = (await db.execute<{ id: string; type: string; valueDecimal: string }>(sql`SELECT id,type,"valueDecimal"::text FROM "CommitmentMovement" WHERE "commitmentId"=${id}`)).rows.map(movement => ({ ...movement, valueDecimal: new Decimal(movement.valueDecimal) }));
  return { id: row.id, number: row.number, date: at(row.date), status: row.status, value: row.value, valueDecimal: amount(row.valueDecimal), appropriationId: row.appropriationId, supplierId: row.supplierId, reservationId: row.reservationId,
    appropriation: { id: row.appropriationId, budgetUnitId: row.budgetUnitId, financialYearId: row.financialYearId, financialYear: { id: row.financialYearId, year: row.year, governmentEntityId: row.governmentEntityId } },
    reservation: row.reservationId ? { id: row.reservationId, expenseId: row.expenseId, expense: row.expenseId ? { id: row.expenseId, sourceModule: row.sourceModule, sourceType: row.sourceType, sourceId: row.sourceId, status: row.expenseStatus, appropriationId: row.expenseAppropriationId, supplierId: row.expenseSupplierId, valueDecimal: amount(row.expenseValueDecimal) } : null } : null, movements };
}
export async function requirePersonnelSettlement(db: DatabaseExecutor, id: string) {
  const { rows: [row] } = await db.execute<{ id: string; commitmentId: string; date: Date | string; status: string; value: number; valueDecimal: string | null }>(sql`SELECT id,"commitmentId",date,status,value,"valueDecimal"::text FROM "Settlement" WHERE id=${id}`);
  if (!row) throw new Error("Liquidação não encontrada.");
  return { ...row, date: at(row.date), valueDecimal: amount(row.valueDecimal), commitment: await requirePersonnelCommitment(db, row.commitmentId) };
}
export async function requirePersonnelPayment(db: DatabaseExecutor, id: string) {
  const { rows: [row] } = await db.execute<{ id: string; commitmentId: string; settlementId: string | null; date: Date | string; status: string; value: number; valueDecimal: string | null; netValueDecimal: string | null }>(sql`SELECT id,"commitmentId","settlementId",date,status,value,"valueDecimal"::text,"netValueDecimal"::text FROM "Payment" WHERE id=${id}`);
  if (!row) throw new Error("Pagamento não encontrado.");
  return { ...row, date: at(row.date), valueDecimal: amount(row.valueDecimal), netValueDecimal: amount(row.netValueDecimal), commitment: await requirePersonnelCommitment(db, row.commitmentId) };
}
export async function requirePersonnelSettlementWithRetentions(db: DatabaseExecutor, id: string) {
  const settlement = await requirePersonnelSettlement(db, id);
  const retentions = (await db.execute<{ id: string; valueDecimal: string }>(sql`SELECT id,"valueDecimal"::text FROM "SettlementRetention" WHERE "settlementId"=${id}`)).rows.map(row => ({ ...row, valueDecimal: new Decimal(row.valueDecimal) }));
  return { ...settlement, retentions };
}
export async function requirePersonnelPaymentWithRetentions(db: DatabaseExecutor, id: string) {
  const payment = await requirePersonnelPayment(db, id);
  const rows = (await db.execute<{ id: string; payableId: string | null; payableStatus: string | null }>(sql`SELECT r.id,w.id AS "payableId",w.status AS "payableStatus" FROM "PaymentRetention" r LEFT JOIN "WithholdingPayable" w ON w."retentionId"=r.id WHERE r."paymentId"=${id}`)).rows;
  return { ...payment, retentions: rows.map(row => ({ id: row.id, withholdingPayable: row.payableId ? { id: row.payableId, status: row.payableStatus } : null })) };
}
export async function listPersonnelAllowancePayments(db: DatabaseExecutor, sourceType: string, sourceId: string, excludedIds: string[] = []) {
  const ids = (await db.execute<{ id: string }>(sql`SELECT p.id FROM "Payment" p JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetReservation" r ON r.id=c."reservationId" JOIN "Expense" e ON e.id=r."expenseId" WHERE p.status='Paga' AND e."sourceModule"='RH' AND e."sourceType"=${sourceType} AND e."sourceId"=${sourceId} ORDER BY p.id`)).rows.filter(row => !excludedIds.includes(row.id));
  const rows = [];
  for (const { id } of ids) rows.push(await requirePersonnelPayment(db, id));
  return rows;
}
export async function requirePersonnelTreasuryMovement(db: DatabaseExecutor, selector: { id: string } | { idempotencyKey: string }) {
  const condition = "id" in selector ? sql`id=${selector.id}` : sql`"idempotencyKey"=${selector.idempotencyKey}`;
  const { rows: [row] } = await db.execute<{ id: string; status: string; direction: string; valueDecimal: string }>(sql`SELECT id,status,direction,"valueDecimal"::text FROM "TreasuryMovement" WHERE ${condition}`);
  if (!row) throw new Error("Movimento de tesouraria não encontrado.");
  return { ...row, valueDecimal: new Decimal(row.valueDecimal) };
}
type RevenueRow = { id: string; sourceModule: string; sourceType: string | null; sourceId: string | null; budgetUnitId: string | null; financialYearId: string | null; stage: string; reversedAt: Date | string | null; date: Date | string; valueDecimal: string | null; treasuryMovementId: string | null; year: number | null; governmentEntityId: string | null };
async function revenueRows(db: DatabaseExecutor, condition: SQL) {
  const rows = (await db.execute<RevenueRow>(sql`SELECT r.id,r."sourceModule",r."sourceType",r."sourceId",r."budgetUnitId",r."financialYearId",r.stage,r."reversedAt",r.date,r."valueDecimal"::text,t.id AS "treasuryMovementId",y.year,y."governmentEntityId" FROM "Revenue" r LEFT JOIN "FinancialYear" y ON y.id=r."financialYearId" LEFT JOIN "TreasuryMovement" t ON t."revenueId"=r.id WHERE ${condition}`)).rows;
  const result = [];
  for (const row of rows) result.push({ ...row, date: at(row.date), reversedAt: row.reversedAt ? at(row.reversedAt) : null, valueDecimal: amount(row.valueDecimal), financialYear: row.financialYearId && row.year !== null ? { id: row.financialYearId, year: row.year, governmentEntityId: row.governmentEntityId } : null, treasuryMovement: row.treasuryMovementId ? await requirePersonnelTreasuryMovement(db, { id: row.treasuryMovementId }) : null });
  return result;
}
export async function requirePersonnelRevenue(db: DatabaseExecutor, id: string) {
  const [row] = await revenueRows(db, sql`r.id=${id}`);
  if (!row) throw new Error("Receita não encontrada.");
  return row;
}
export async function listPersonnelAllowanceRefunds(db: DatabaseExecutor, sourceType: string, sourceId: string) {
  return revenueRows(db, sql`r."sourceModule"='RH' AND r."sourceType"=${sourceType} AND r."sourceId"=${sourceId} AND r.stage='ARRECADADA' AND r."reversedAt" IS NULL`);
}
export async function requirePersonnelAccountingTransaction(db: DatabaseExecutor, selector: { id: string } | { idempotencyKey: string }) {
  const condition = "id" in selector ? sql`id=${selector.id}` : sql`"idempotencyKey"=${selector.idempotencyKey}`;
  const { rows: [row] } = await db.execute<{ id: string; financialYearId: string; governmentEntityId: string | null; budgetUnitId: string | null; sourceId: string | null; date: Date | string }>(sql`SELECT id,"financialYearId","governmentEntityId","budgetUnitId","sourceId",date FROM "AccountingTransaction" WHERE ${condition}`);
  if (!row) throw new Error("Partida contábil não encontrada.");
  const entries = (await db.execute<{ id: string; accountId: string; type: string; value: number; valueDecimal: string | null }>(sql`SELECT id,"accountId",type,value,"valueDecimal"::text FROM "AccountingEntry" WHERE "transactionId"=${row.id}`)).rows.map(entry => ({ ...entry, valueDecimal: amount(entry.valueDecimal) }));
  return { ...row, date: at(row.date), entries };
}
export async function listPersonnelAccountingDebits(db: DatabaseExecutor, transactionIds: string[]) {
  const result = [];
  for (const id of [...new Set(transactionIds)]) {
    const transaction = await requirePersonnelAccountingTransaction(db, { id });
    result.push(...transaction.entries.filter(row => row.type === "Débito"));
  }
  return result;
}
export async function listPersonnelAccountingAccounts(db: DatabaseExecutor, ids: string[]) {
  if (!ids.length) return [];
  return (await db.execute<{ id: string; code: string }>(sql`SELECT id,code FROM "AccountingPlan" WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`)).rows;
}
