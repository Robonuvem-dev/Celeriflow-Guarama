import { eq, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import { taxpayers } from "@/db/schema/registry";

type DiagnosticCommitment = {
  id: string; supplierId: string; contractId: string | null; valueDecimal: Decimal | null;
  supplier: { id: string; personId: string | null; companyId: string | null };
  appropriation: { budgetUnitId: string };
  movements: Array<{ id: string; type: string; valueDecimal: Decimal }>;
};

async function readCommitments(db: DatabaseExecutor, filter: SQL, orderById: boolean): Promise<DiagnosticCommitment[]> {
  const rows = (await db.execute<{
    id: string; supplierId: string; contractId: string | null; valueDecimal: string | null;
    personId: string | null; companyId: string | null; budgetUnitId: string;
  }>(sql`SELECT c.id, c."supplierId", c."contractId", c."valueDecimal"::text AS "valueDecimal", s."personId", s."companyId", a."budgetUnitId"
    FROM "Commitment" c JOIN "Supplier" s ON s.id=c."supplierId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId"
    WHERE ${filter} ${orderById ? sql`ORDER BY c.id ASC` : sql``}`)).rows;
  if (!rows.length) return [];
  const movements = (await db.execute<{ id: string; commitmentId: string; type: string; valueDecimal: string }>(sql`
    SELECT id, "commitmentId", type, "valueDecimal"::text AS "valueDecimal" FROM "CommitmentMovement"
    WHERE "commitmentId" IN (${sql.join(rows.map(row => sql`${row.id}`), sql`, `)})`)).rows;
  return rows.map(row => ({
    id: row.id, supplierId: row.supplierId, contractId: row.contractId,
    valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal),
    supplier: { id: row.supplierId, personId: row.personId, companyId: row.companyId },
    appropriation: { budgetUnitId: row.budgetUnitId },
    movements: movements.filter(movement => movement.commitmentId === row.id).map(movement => ({ id: movement.id, type: movement.type, valueDecimal: new Decimal(movement.valueDecimal) })),
  }));
}

export async function listDiagnosticYearCommitments(db: DatabaseExecutor, financialYearId: string, budgetUnitIds: string[]) {
  if (!budgetUnitIds.length) return [];
  return readCommitments(db, sql`a."financialYearId"=${financialYearId} AND a."budgetUnitId" IN (${sql.join(budgetUnitIds.map(id => sql`${id}`), sql`, `)})`, true);
}

export async function readDiagnosticContract(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; number: string; sourceBudgetUnitId: string | null; updatedValue: number; updatedAt: string }>(sql`
    SELECT id, number, "sourceBudgetUnitId", "updatedValue", to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM "Contract" WHERE id=${id}`)).rows;
  if (!row) throw new Error("Contrato não encontrado.");
  return { ...row, updatedAt: new Date(row.updatedAt), commitments: await readCommitments(db, sql`c."contractId"=${id}`, false) };
}

export async function findDiagnosticTaxpayers(db: DatabaseExecutor, personId: string | null, companyId: string | null) {
  if (!personId && !companyId) return [];
  return db.select({ id: taxpayers.id, taxpayerType: taxpayers.taxpayerType, personId: taxpayers.personId, companyId: taxpayers.companyId }).from(taxpayers)
    .where(or(personId ? eq(taxpayers.personId, personId) : undefined, companyId ? eq(taxpayers.companyId, companyId) : undefined)).limit(2);
}

export async function listDiagnosticAssessments(db: DatabaseExecutor, taxpayerId: string) {
  const rows = (await db.execute<{
    id: string; calculationSnapshot: JsonValue | null; originalValueDecimal: string | null; finalValueDecimal: string | null;
    activeDebt: { id: string; budgetUnitId: string | null; status: string } | null;
  }>(sql`SELECT a.id, a."calculationSnapshot", a."originalValueDecimal"::text AS "originalValueDecimal", a."finalValueDecimal"::text AS "finalValueDecimal",
    CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id', d.id, 'budgetUnitId', d."budgetUnitId", 'status', d.status) END AS "activeDebt"
    FROM "TaxAssessment" a LEFT JOIN "ActiveDebt" d ON d."assessmentId"=a.id
    WHERE a."taxpayerId"=${taxpayerId} AND a.status NOT IN ('Cancelado', 'CANCELADO') ORDER BY a.id ASC`)).rows;
  return rows.map(row => ({ ...row, originalValueDecimal: row.originalValueDecimal === null ? null : new Decimal(row.originalValueDecimal), finalValueDecimal: row.finalValueDecimal === null ? null : new Decimal(row.finalValueDecimal) }));
}

export async function listDiagnosticConfirmedPayments(db: DatabaseExecutor, assessmentId: string) {
  const rows = (await db.execute<{ id: string; amountPaidDecimal: string | null }>(sql`
    SELECT p.id, p."amountPaidDecimal"::text AS "amountPaidDecimal" FROM "TaxPayment" p JOIN "TaxGuide" g ON g.id=p."guideId"
    WHERE g."assessmentId"=${assessmentId} AND p.status='Confirmado'`)).rows;
  return rows.map(row => ({ ...row, amountPaidDecimal: row.amountPaidDecimal === null ? null : new Decimal(row.amountPaidDecimal) }));
}

export async function listDiagnosticUnlinkedDebts(db: DatabaseExecutor, taxpayerId: string, governmentEntityId: string) {
  return (await db.execute<{ id: string }>(sql`SELECT id FROM "ActiveDebt" WHERE "taxpayerId"=${taxpayerId} AND "assessmentId" IS NULL
    AND status NOT IN ('PAGA', 'Paga', 'CANCELADA', 'Cancelada', 'BAIXADA', 'BAIXADA_PRESCRICAO', 'DEVOLVIDA')
    AND ("governmentEntityId"=${governmentEntityId} OR "governmentEntityId" IS NULL)`)).rows;
}

export async function listDiagnosticBankAccounts(db: DatabaseExecutor, budgetUnitIds: string[], through: Date) {
  if (!budgetUnitIds.length) return [];
  const accounts = (await db.execute<{ id: string; resourceSourceId: string | null }>(sql`SELECT id, "resourceSourceId" FROM "BankAccount"
    WHERE "budgetUnitId" IN (${sql.join(budgetUnitIds.map(id => sql`${id}`), sql`, `)})`)).rows;
  if (!accounts.length) return [];
  const movements = (await db.execute<{ id: string; bankAccountId: string; type: string; direction: string; valueDecimal: string }>(sql`
    SELECT id, "bankAccountId", type, direction, "valueDecimal"::text AS "valueDecimal" FROM "TreasuryMovement"
    WHERE "bankAccountId" IN (${sql.join(accounts.map(account => sql`${account.id}`), sql`, `)}) AND status='Confirmado' AND date <= ${through}
    ORDER BY id ASC`)).rows;
  return accounts.map(account => ({ ...account, treasuryMovements: movements.filter(movement => movement.bankAccountId === account.id).map(movement => ({ ...movement, valueDecimal: new Decimal(movement.valueDecimal) })) }));
}

export async function readDiagnosticBankCreation(db: DatabaseExecutor, accountId: string) {
  const [row] = (await db.execute<{ payload: JsonValue | null }>(sql`SELECT payload FROM "FinancialAuditLog"
    WHERE "entityType"='BankAccount' AND "entityId"=${accountId} AND action='CREATE' ORDER BY "createdAt" ASC LIMIT 1`)).rows;
  return row ?? null;
}
