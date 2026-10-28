import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Decimal } from "../../decimal";
import { PersistenceError } from "../../errors";
import type { DatabaseExecutor } from "../../transaction";
import { bankStatementImports, bankStatementItems } from "../../schema/finance-banking";
import { bankReconciliationAllocationGroups, bankReconciliationAllocations, bankReconciliationSessions, reconciliationBankAccounts, reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";
import type { BankReconciliationSession, ReconciliationAllocation, ReconciliationAllocationGroup, ReconciliationBankAccount, ReconciliationStatementOrigin, ReconciliationTreasuryOrigin } from "@/lib/contracts/finance-reconciliation";
import { FinanceError } from "@/lib/financeiro/errors";

export async function findReconciliationSession(db: DatabaseExecutor, id: string): Promise<BankReconciliationSession> {
  const [session] = await db.select().from(bankReconciliationSessions).where(eq(bankReconciliationSessions.id, id));
  if (!session) throw new PersistenceError("not-found", "Registro não encontrado.");
  return session;
}

export async function findReconciliationAccounts(db: DatabaseExecutor, session: BankReconciliationSession): Promise<ReconciliationBankAccount[]> {
  return db.select().from(reconciliationBankAccounts).where(session.bankAccountId ? eq(reconciliationBankAccounts.id, session.bankAccountId) : and(eq(reconciliationBankAccounts.bankName, session.banco), eq(reconciliationBankAccounts.agency, session.agencia), eq(reconciliationBankAccounts.accountNumber, session.contaNumero)));
}

export async function hasReconciliationEntityBinding(db: DatabaseExecutor, budgetUnitId: string): Promise<boolean> {
  const result = await db.execute<{ found: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "PlanningEntityUnit" WHERE "budgetUnitId" = ${budgetUnitId}) AS found`);
  return result.rows[0].found;
}

/** The original ledger policy deliberately uses the recorded float mirror only
 * when the historic Decimal has not been reconciled. Never aggregate via float. */
export async function readReconciliationLedgerBalance(db: DatabaseExecutor, bankAccountId: string, throughDate?: Date): Promise<Decimal> {
  const [account] = await db.select({ accountingPlanId: reconciliationBankAccounts.accountingPlanId, budgetUnitId: reconciliationBankAccounts.budgetUnitId }).from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, bankAccountId));
  if (!account?.accountingPlanId) throw new FinanceError("A conta bancária deve possuir uma conta analítica vinculada para calcular o razão bancário.");
  if (!account.budgetUnitId) throw new FinanceError("Conta bancária sem unidade gestora para isolamento do razão.");
  const duplicate = await db.execute<{ found: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "BankAccount" WHERE id <> ${bankAccountId} AND "accountingPlanId" = ${account.accountingPlanId} AND "budgetUnitId" = ${account.budgetUnitId}) AS found`);
  if (duplicate.rows[0].found) throw new FinanceError("Mais de uma conta bancária utiliza o mesmo razão na UG; configure subcontas analíticas individuais.");
  const date = throughDate ? sql`t.date <= ${throughDate}` : sql`true`;
  const legacy = await db.execute<{ found: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "AccountingEntry" e JOIN "AccountingTransaction" t ON t.id = e."transactionId" WHERE e."accountId" = ${account.accountingPlanId} AND t.status = 'POSTADO' AND t."budgetUnitId" IS NULL AND ${date}) AS found`);
  if (legacy.rows[0].found) throw new FinanceError("O razão possui partidas legadas sem UG; concilie a origem antes de calcular saldo por conta.");
  const entries = await db.execute<{ type: string; value: number; valueDecimal: string | null }>(sql`SELECT e.type, e.value, e."valueDecimal"::text AS "valueDecimal" FROM "AccountingEntry" e JOIN "AccountingTransaction" t ON t.id = e."transactionId" WHERE e."accountId" = ${account.accountingPlanId} AND t.status = 'POSTADO' AND t."budgetUnitId" = ${account.budgetUnitId} AND ${date}`);
  return entries.rows.reduce((total, entry) => {
    const value = new Decimal(entry.valueDecimal ?? String(entry.value));
    if (entry.type === "Débito") return total.plus(value);
    if (entry.type === "Crédito") return total.minus(value);
    throw new FinanceError(`Natureza contábil inválida no razão bancário: ${entry.type}.`);
  }, new Decimal(0));
}

export async function loadReconciliationOrigins(db: DatabaseExecutor, session: BankReconciliationSession, account: ReconciliationBankAccount): Promise<{
  items: ReconciliationStatementOrigin[]; movements: ReconciliationTreasuryOrigin[];
  groups: (ReconciliationAllocationGroup & { allocations: ReconciliationAllocation[] })[];
}> {
  const physical = await db.select({ id: reconciliationBankAccounts.id }).from(reconciliationBankAccounts).where(and(eq(reconciliationBankAccounts.bankName, account.bankName), eq(reconciliationBankAccounts.agency, account.agency), eq(reconciliationBankAccounts.accountNumber, account.accountNumber)));
  const imports = await db.select({ id: bankStatementImports.id }).from(bankStatementImports).where(eq(bankStatementImports.bankAccountId, account.id));
  const [items, movements, groups] = await Promise.all([
    db.select().from(bankStatementItems).where(and(gte(bankStatementItems.date, session.dataInicio), lte(bankStatementItems.date, session.dataFim), or(
      eq(bankStatementItems.bankAccountId, account.id),
      and(isNull(bankStatementItems.bankAccountId), inArray(bankStatementItems.statementImportId, imports.map(row => row.id))),
      physical.length === 1 ? and(isNull(bankStatementItems.bankAccountId), isNull(bankStatementItems.statementImportId), eq(bankStatementItems.banco, account.bankName), eq(bankStatementItems.agencia, account.agency), eq(bankStatementItems.contaNumero, account.accountNumber)) : undefined,
    ))).orderBy(asc(bankStatementItems.date), asc(bankStatementItems.id)),
    db.select().from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.bankAccountId, account.id), eq(reconciliationTreasuryMovements.status, "Confirmado"), lte(reconciliationTreasuryMovements.date, session.dataFim))).orderBy(asc(reconciliationTreasuryMovements.date), asc(reconciliationTreasuryMovements.id)),
    db.select().from(bankReconciliationAllocationGroups).where(eq(bankReconciliationAllocationGroups.sessionId, session.id)).orderBy(asc(bankReconciliationAllocationGroups.createdAt), asc(bankReconciliationAllocationGroups.id)),
  ]);
  const itemIds = items.map(row => row.id), movementIds = movements.map(row => row.id);
  const [active, allocations, linked] = await Promise.all([
    db.select({ allocation: bankReconciliationAllocations }).from(bankReconciliationAllocations).innerJoin(bankReconciliationAllocationGroups, eq(bankReconciliationAllocationGroups.id, bankReconciliationAllocations.groupId)).where(and(eq(bankReconciliationAllocationGroups.status, "EFETIVADO"), or(inArray(bankReconciliationAllocations.statementItemId, itemIds), inArray(bankReconciliationAllocations.treasuryMovementId, movementIds)))),
    groups.length ? db.select().from(bankReconciliationAllocations).where(inArray(bankReconciliationAllocations.groupId, groups.map(row => row.id))) : [],
    movementIds.length ? db.select().from(bankStatementItems).where(inArray(bankStatementItems.treasuryMovementId, movementIds)) : [],
  ]);
  return {
    items: items.map(item => ({ ...item, reconciliationAllocations: active.filter(row => row.allocation.statementItemId === item.id).map(row => row.allocation) })),
    movements: movements.map(movement => ({ ...movement, statementItems: linked.filter(row => row.treasuryMovementId === movement.id), reconciliationAllocations: active.filter(row => row.allocation.treasuryMovementId === movement.id).map(row => row.allocation) })),
    groups: groups.map(group => ({ ...group, allocations: allocations.filter(row => row.groupId === group.id) })),
  };
}

export async function findReconciliationGroup(db: DatabaseExecutor, key: { id: string } | { idempotencyKey: string }): Promise<(ReconciliationAllocationGroup & { allocations: ReconciliationAllocation[] }) | null> {
  const [group] = await db.select().from(bankReconciliationAllocationGroups).where("id" in key ? eq(bankReconciliationAllocationGroups.id, key.id) : eq(bankReconciliationAllocationGroups.idempotencyKey, key.idempotencyKey));
  if (!group) return null;
  const allocations = await db.select().from(bankReconciliationAllocations).where(eq(bankReconciliationAllocations.groupId, group.id));
  return { ...group, allocations };
}

export async function listReconciliationSessions(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<BankReconciliationSession[]> {
  const permitted = allowedBudgetUnitIds === undefined ? undefined : inArray(bankReconciliationSessions.bankAccountId, db.select({ id: reconciliationBankAccounts.id }).from(reconciliationBankAccounts).where(inArray(reconciliationBankAccounts.budgetUnitId, allowedBudgetUnitIds)));
  return db.select().from(bankReconciliationSessions).where(permitted).orderBy(desc(bankReconciliationSessions.createdAt)).limit(30);
}
