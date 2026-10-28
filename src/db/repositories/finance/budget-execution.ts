import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { Decimal } from "../../decimal";
import { budgetAppropriations, budgetMovements, budgetReservations, commitments, commitmentMovements } from "../../schema/finance-budget";
import { expenses } from "../../schema/finance-expenses";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { creditors } from "../../schema/finance-identity";

export type ExpenseRecord = typeof expenses.$inferSelect;
export type BudgetReservationRecord = typeof budgetReservations.$inferSelect;
export type CommitmentRecord = typeof commitments.$inferSelect;
export async function findBudgetAppropriation(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(budgetAppropriations).where(eq(budgetAppropriations.id, id));
  if (!row) return null;
  const [nature] = (await db.execute<{ procurementOriginPolicy: string }>(sql`SELECT "procurementOriginPolicy" FROM "ExpenseNature" WHERE id=${row.expenseNatureId}`)).rows;
  if (!nature) throw new Error("Natureza da dotação não encontrada.");
  return { ...row, expenseNature: nature };
}
export async function readBudgetAppropriation(db: DatabaseExecutor, id: string) {
  const row = await findBudgetAppropriation(db, id);
  if (!row) throw new Error("Dotação orçamentária não encontrada.");
  return row;
}
export async function listBudgetCommitments(db: DatabaseExecutor, filter: { appropriationId?: string; contractId?: string; financialYearId?: string; budgetUnitId?: string; from?: Date; before?: Date }) {
  const rows = await db.select({ commitment: commitments }).from(commitments).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).where(and(inArray(commitments.status, ["Emitido", "Liquidado", "Pago"]), filter.appropriationId ? eq(commitments.appropriationId, filter.appropriationId) : undefined, filter.contractId ? eq(commitments.contractId, filter.contractId) : undefined, filter.financialYearId ? eq(budgetAppropriations.financialYearId, filter.financialYearId) : undefined, filter.budgetUnitId ? eq(budgetAppropriations.budgetUnitId, filter.budgetUnitId) : undefined, filter.from ? gte(commitments.date, filter.from) : undefined, filter.before ? lt(commitments.date, filter.before) : undefined));
  const movements = rows.length ? await db.select().from(commitmentMovements).where(inArray(commitmentMovements.commitmentId, rows.map(row => row.commitment.id))) : [];
  return rows.map(({ commitment }) => ({ ...commitment, movements: movements.filter(movement => movement.commitmentId === commitment.id) }));
}
export async function listActiveBudgetReservations(db: DatabaseExecutor, filter: { appropriationId?: string; financialYearId?: string; budgetUnitId?: string; from?: Date; before?: Date }) {
  const rows = await db.select({ reservation: budgetReservations }).from(budgetReservations).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, budgetReservations.appropriationId)).where(and(eq(budgetReservations.status, "Ativa"), filter.appropriationId ? eq(budgetReservations.appropriationId, filter.appropriationId) : undefined, filter.financialYearId ? eq(budgetAppropriations.financialYearId, filter.financialYearId) : undefined, filter.budgetUnitId ? eq(budgetAppropriations.budgetUnitId, filter.budgetUnitId) : undefined, filter.from ? gte(budgetReservations.date, filter.from) : undefined, filter.before ? lt(budgetReservations.date, filter.before) : undefined));
  return rows.map(row => row.reservation);
}
export async function findExpenseRequest(db: DatabaseExecutor, filter: { id?: string; idempotencyKey?: string }) {
  const [row] = await db.select().from(expenses).where(filter.id !== undefined ? eq(expenses.id, filter.id) : eq(expenses.idempotencyKey, filter.idempotencyKey!));
  return row ?? null;
}
export async function insertExpenseRequest(tx: DatabaseTransaction, input: typeof expenses.$inferInsert): Promise<ExpenseRecord> {
  const [row] = await tx.insert(expenses).values(input).returning();
  return row;
}
export async function updateExpenseRequest(tx: DatabaseTransaction, id: string, input: Partial<Pick<ExpenseRecord, "status" | "approvedById" | "approvedAt">>): Promise<ExpenseRecord> {
  const [row] = await tx.update(expenses).set(input).where(eq(expenses.id, id)).returning();
  if (!row) throw new Error("Solicitação de despesa não encontrada.");
  return row;
}
export async function findBudgetReservation(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(budgetReservations).where(eq(budgetReservations.id, id));
  return row ?? null;
}
export async function insertBudgetReservation(tx: DatabaseTransaction, input: typeof budgetReservations.$inferInsert): Promise<BudgetReservationRecord> {
  const [row] = await tx.insert(budgetReservations).values(input).returning();
  return row;
}
export async function setBudgetReservationStatus(tx: DatabaseTransaction, id: string, status: string): Promise<BudgetReservationRecord> {
  const [row] = await tx.update(budgetReservations).set({ status }).where(eq(budgetReservations.id, id)).returning();
  if (!row) throw new Error("Reserva orçamentária não encontrada.");
  return row;
}
export async function findBudgetMovementReplay(db: DatabaseExecutor, key: string) {
  const [row] = await db.select().from(budgetMovements).where(eq(budgetMovements.idempotencyKey, key));
  return row ?? null;
}
export async function insertBudgetMovement(tx: DatabaseTransaction, input: typeof budgetMovements.$inferInsert) {
  const [row] = await tx.insert(budgetMovements).values(input).returning();
  return row;
}
export async function updateBudgetAmounts(tx: DatabaseTransaction, id: string, input: { committed?: Decimal; updated?: Decimal }): Promise<void> {
  await tx.update(budgetAppropriations).set({ ...(input.committed === undefined ? {} : { committedValueDecimal: input.committed, committedValue: Number(input.committed.toString()) }), ...(input.updated === undefined ? {} : { updatedValueDecimal: input.updated, updatedValue: Number(input.updated.toString()) }) }).where(eq(budgetAppropriations.id, id));
}
export async function findFinanceSupplier(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ supplier: suppliers, person: people, company: companies }).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(eq(suppliers.id, id));
  return row ? { ...row.supplier, person: row.person, company: row.company } : null;
}
export async function upsertSupplierCreditor(tx: DatabaseTransaction, input: { supplierId: string; name: string; document?: string; personId?: string; companyId?: string; status: string }) {
  const [row] = await tx.insert(creditors).values(input).onConflictDoUpdate({ target: creditors.supplierId, set: { name: input.name, document: input.document, status: input.status, updatedAt: new Date() } }).returning();
  return row;
}
export async function findFinancePurchaseReceipt(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; status: string; contractId: string; purchaseProcessId: string | null; supplierId: string; secretariatId: string }>(sql`SELECT r.id,r.status,r."contractId",r."purchaseProcessId",c."supplierId",c."secretariatId" FROM "PurchaseReceipt" r JOIN "Contract" c ON c.id=r."contractId" WHERE r.id=${id}`)).rows;
  if (!row) return null;
  const items = (await db.execute<{ quantity: number; unitCost: number }>(sql`SELECT quantity,"unitCost" FROM "PurchaseReceiptItem" WHERE "purchaseReceiptId"=${id}`)).rows;
  return { id: row.id, status: row.status, contractId: row.contractId, purchaseProcessId: row.purchaseProcessId, contract: { supplierId: row.supplierId, secretariatId: row.secretariatId }, items };
}
export async function isPlanningOwnedAppropriation(db: DatabaseExecutor, id: string): Promise<boolean> {
  const [runtime] = (await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningBudgetLine"') IS NOT NULL AS ready`)).rows;
  return runtime.ready && (await db.execute(sql`SELECT id FROM "PlanningBudgetLine" WHERE "appropriationId"=${id} LIMIT 1`)).rows.length > 0;
}
export async function readLegacyCmdSchedule(tx: DatabaseTransaction, fixationId: string, budgetUnitId: string) {
  const [fixation] = (await tx.execute<{ annualBudgetLawId: string }>(sql`SELECT "annualBudgetLawId" FROM "AnnualBudgetExpenseFixation" WHERE id=${fixationId}`)).rows;
  if (!fixation) return null;
  await tx.execute(sql`SELECT id FROM "MonthlyDisbursementSchedule" WHERE "annualBudgetLawId"=${fixation.annualBudgetLawId} AND "budgetUnitId"=${budgetUnitId} FOR UPDATE`);
  const rows = (await tx.execute<{ month: number; limitValue: string }>(sql`SELECT month,"limitValue"::text FROM "MonthlyDisbursementSchedule" WHERE "annualBudgetLawId"=${fixation.annualBudgetLawId} AND "budgetUnitId"=${budgetUnitId}`)).rows;
  return rows.map(row => ({ month: row.month, limitValue: new Decimal(row.limitValue) }));
}
export async function findFinanceCommitment(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(commitments).where(eq(commitments.id, id));
  if (!row) return null;
  const [appropriation, movements] = await Promise.all([readBudgetAppropriation(db, row.appropriationId), db.select().from(commitmentMovements).where(eq(commitmentMovements.commitmentId, id))]);
  return { ...row, appropriation, movements };
}
export async function insertFinanceCommitment(tx: DatabaseTransaction, input: typeof commitments.$inferInsert): Promise<CommitmentRecord> {
  const [row] = await tx.insert(commitments).values(input).returning();
  return row;
}
export async function setFinanceCommitmentStatus(tx: DatabaseTransaction, id: string, status: string): Promise<CommitmentRecord> {
  const [row] = await tx.update(commitments).set({ status }).where(eq(commitments.id, id)).returning();
  if (!row) throw new Error("Empenho não encontrado.");
  return row;
}
export async function insertFinanceCommitmentMovement(tx: DatabaseTransaction, input: typeof commitmentMovements.$inferInsert) {
  const [row] = await tx.insert(commitmentMovements).values(input).returning();
  return row;
}
export async function listCommitmentSettlementAmounts(db: DatabaseExecutor, commitmentId: string) {
  const rows = (await db.execute<{ id: string; valueDecimal: string | null }>(sql`SELECT id,"valueDecimal"::text FROM "Settlement" WHERE "commitmentId"=${commitmentId} AND status='Liquidado'`)).rows;
  return rows.map(row => ({ ...row, valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal) }));
}
export async function listActivePaymentAmounts(db: DatabaseExecutor, filter: { commitmentId?: string; settlementId?: string; payableCarryForwardId?: string }) {
  const rows = (await db.execute<{ id: string; valueDecimal: string | null }>(sql`SELECT id,"valueDecimal"::text FROM "Payment" WHERE status IN ('Emitida','Paga') ${filter.commitmentId === undefined ? sql`` : sql`AND "commitmentId"=${filter.commitmentId}`} ${filter.settlementId === undefined ? sql`` : sql`AND "settlementId"=${filter.settlementId}`} ${filter.payableCarryForwardId === undefined ? sql`` : sql`AND "payableCarryForwardId"=${filter.payableCarryForwardId}`}`)).rows;
  return rows.map(row => ({ ...row, valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal) }));
}
