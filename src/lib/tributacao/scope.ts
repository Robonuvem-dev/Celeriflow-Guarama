import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { readTaxAssessmentCompensationMovements } from "@/db/repositories/taxation/assessment-credit";
import type { TaxActor } from "./index";
import { taxAssessments } from "@/db/schema/taxation-core";
import { taxActiveDebts } from "@/db/schema/tax-accounting";
import { financialYears } from "@/db/schema/finance-years";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { findTaxFinancialMapping, readConfirmedTaxAssessmentPayments, readTaxAssessment, taxJsonString } from "@/db/repositories/tax-accounting/records";

// Optional JSON object members retain the existing snapshot DTO while accepting
// both the independent database JSON contract and legacy persisted JSON values.
type TaxScopeJsonValue = string | number | boolean | null | TaxScopeJsonValue[] | TaxScopeSnapshot;
export type TaxScopeSnapshot = { [key: string]: TaxScopeJsonValue | undefined };

export function taxScopeSnapshot(value?: TaxScopeJsonValue | null): TaxScopeSnapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function taxAssessmentCompensatedValue(db: DatabaseExecutor, assessmentId: string): Promise<Decimal> {
  // Use only the executor supplied by the caller; C7 supplies its own
  // repeatable-read transaction. No connection or transaction is opened here.
  const movements = await readTaxAssessmentCompensationMovements(db, assessmentId);
  return movements.reduce((sum, movement) => {
    const data = taxScopeSnapshot(movement.data);
    return data.operation === "COMPENSAR" ? sum.plus(new Decimal(String(data.amount))) : sum;
  }, new Decimal(0));
}

/** Legacy rows without recorded origin remain available to the technical administrator. */
export function taxAssessmentAccessFilter(budgetUnitIds?: string[]): SQL | undefined {
  if (!budgetUnitIds) return undefined;
  if (!budgetUnitIds.length) return sql`false`;
  return or(...budgetUnitIds.map(budgetUnitId => taxJsonString(taxAssessments.calculationSnapshot, "budgetUnitId", budgetUnitId)));
}

export function activeDebtAccessFilter(budgetUnitIds?: string[]): SQL | undefined {
  if (!budgetUnitIds) return undefined;
  if (!budgetUnitIds.length) return sql`false`;
  return or(inArray(taxActiveDebts.budgetUnitId, budgetUnitIds), and(isNull(taxActiveDebts.budgetUnitId), sql`exists (select 1 from ${taxAssessments} where ${taxAssessments.id} = ${taxActiveDebts.assessmentId} and ${taxAssessmentAccessFilter(budgetUnitIds)})`));
}

/** Refreshes the debt from canonical confirmed payments, compensations and assessment value. */
export async function synchronizeAssessmentDebt(tx: DatabaseTransaction, actor: TaxActor, assessmentId: string) {
  const debt = (await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, assessmentId)).limit(1))[0];
  if (!debt) return null;
  const assessment = await readTaxAssessment(tx, assessmentId);
  const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  if ((debt.budgetUnitId && debt.budgetUnitId !== scope.budgetUnitId) || (debt.governmentEntityId && debt.governmentEntityId !== scope.governmentEntityId)) throw new Error("Dívida diverge da UG/ente do lançamento original.");
  const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
  if (!total) throw new Error("Dívida sem valor Decimal conciliado do lançamento.");
  const payments = await readConfirmedTaxAssessmentPayments(tx, assessmentId);
  const paid = payments.reduce((sum, payment) => {
    if (!payment.amountPaidDecimal) throw new Error("Arrecadação da dívida sem Decimal conciliado.");
    return sum.plus(payment.amountPaidDecimal);
  }, await taxAssessmentCompensatedValue(tx, assessmentId));
  const remaining = Decimal.max(0, total.minus(paid));
  const collecting = ["Paga", "PAGA", "Inscrita", "INSCRITA", "EM_COBRANCA", "Parcelada", "PARCELADA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status);
  return (await tx.update(taxActiveDebts).set({ updatedValue: Number(remaining), updatedValueDecimal: remaining, ...(collecting ? { status: remaining.isZero() ? "PAGA" : ["EM_PROTESTO", "AJUIZADA"].includes(debt.status) ? debt.status : paid.gt(0) ? "EM_COBRANCA" : "INSCRITA" } : {}) }).where(eq(taxActiveDebts.id, debt.id)).returning())[0];
}

export async function resolveTaxAssessmentScope(db: DatabaseExecutor, actor: TaxActor, taxId: string, snapshot?: TaxScopeJsonValue | null) {
  const stored = taxScopeSnapshot(snapshot);
  const mapping = typeof stored.budgetUnitId === "string" ? null : await findTaxFinancialMapping(db, taxId);
  const budgetUnitId = typeof stored.budgetUnitId === "string" ? stored.budgetUnitId : mapping?.defaultBankAccount.budgetUnitId ?? null;
  if (actor.allowedBudgetUnitIds && (!budgetUnitId || !actor.allowedBudgetUnitIds.includes(budgetUnitId))) throw new Error("Lançamento tributário fora das unidades gestoras autorizadas.");
  const binding = budgetUnitId ? (await db.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId)).limit(1))[0] : null;
  if (budgetUnitId && !binding) throw new Error("Unidade gestora arrecadadora sem entidade vinculada.");
  if (typeof stored.governmentEntityId === "string" && stored.governmentEntityId !== binding?.governmentEntityId) throw new Error("A entidade atual da UG diverge do lançamento tributário; concilie o vínculo histórico.");
  return { budgetUnitId, governmentEntityId: binding?.governmentEntityId ?? null };
}

export async function resolveTaxFinancialYear(db: DatabaseExecutor, year: number, scope: { governmentEntityId: string | null }, requireOpen = true) {
  const financialYear = (await db.select().from(financialYears).where(and(eq(financialYears.year, year), scope.governmentEntityId === null ? isNull(financialYears.governmentEntityId) : eq(financialYears.governmentEntityId, scope.governmentEntityId))).limit(1))[0];
  if (!financialYear) throw new Error(`O exercício financeiro ${year} não está configurado.`);
  if (requireOpen && financialYear.status !== "Aberto") throw new Error(`O exercício financeiro ${year} não está aberto para operação tributária.`);
  return financialYear;
}
