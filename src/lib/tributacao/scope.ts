import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";

type Db = PrismaClient | Prisma.TransactionClient;

export function taxScopeSnapshot(value?: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function taxAssessmentCompensatedValue(db: Db, assessmentId: string) {
  const movements = await db.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", entityId: assessmentId, category: "CREDIT_MOVEMENT", status: "EFETIVADO" }, select: { data: true } });
  return movements.reduce((sum, movement) => {
    const data = taxScopeSnapshot(movement.data);
    return data.operation === "COMPENSAR" ? sum.plus(new Prisma.Decimal(String(data.amount))) : sum;
  }, new Prisma.Decimal(0));
}

/** Legacy rows without recorded origin remain available to the technical administrator. */
export function taxAssessmentAccessFilter(budgetUnitIds?: string[]): Prisma.TaxAssessmentWhereInput {
  if (!budgetUnitIds) return {};
  if (!budgetUnitIds.length) return { id: { in: [] } };
  return { OR: budgetUnitIds.map((budgetUnitId) => ({ calculationSnapshot: { path: ["budgetUnitId"], equals: budgetUnitId } })) };
}

export function activeDebtAccessFilter(budgetUnitIds?: string[]): Prisma.ActiveDebtWhereInput {
  if (!budgetUnitIds) return {};
  if (!budgetUnitIds.length) return { id: { in: [] } };
  return { OR: [{ budgetUnitId: { in: budgetUnitIds } }, { budgetUnitId: null, assessment: taxAssessmentAccessFilter(budgetUnitIds) }] };
}

/** Refreshes the debt from canonical confirmed payments, compensations and assessment value. */
export async function synchronizeAssessmentDebt(tx: Prisma.TransactionClient, actor: TaxActor, assessmentId: string) {
  const debt = await tx.activeDebt.findUnique({ where: { assessmentId } });
  if (!debt) return null;
  const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: assessmentId } });
  const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  if ((debt.budgetUnitId && debt.budgetUnitId !== scope.budgetUnitId) || (debt.governmentEntityId && debt.governmentEntityId !== scope.governmentEntityId)) throw new Error("Dívida diverge da UG/ente do lançamento original.");
  const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
  if (!total) throw new Error("Dívida sem valor Decimal conciliado do lançamento.");
  const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
  const paid = payments.reduce((sum, payment) => {
    if (!payment.amountPaidDecimal) throw new Error("Arrecadação da dívida sem Decimal conciliado.");
    return sum.plus(payment.amountPaidDecimal);
  }, await taxAssessmentCompensatedValue(tx, assessmentId));
  const remaining = Prisma.Decimal.max(0, total.minus(paid));
  const collecting = ["Paga", "PAGA", "Inscrita", "INSCRITA", "EM_COBRANCA", "Parcelada", "PARCELADA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status);
  return tx.activeDebt.update({ where: { id: debt.id }, data: { updatedValue: Number(remaining), updatedValueDecimal: remaining, ...(collecting ? { status: remaining.isZero() ? "PAGA" : ["EM_PROTESTO", "AJUIZADA"].includes(debt.status) ? debt.status : paid.gt(0) ? "EM_COBRANCA" : "INSCRITA" } : {}) } });
}

export async function resolveTaxAssessmentScope(db: Db, actor: TaxActor, taxId: string, snapshot?: Prisma.JsonValue | null) {
  const stored = taxScopeSnapshot(snapshot);
  const mapping = typeof stored.budgetUnitId === "string" ? null : await db.taxFinancialMapping.findUnique({ where: { taxId }, select: { defaultBankAccount: { select: { budgetUnitId: true } } } });
  const budgetUnitId = typeof stored.budgetUnitId === "string" ? stored.budgetUnitId : mapping?.defaultBankAccount.budgetUnitId ?? null;
  if (actor.allowedBudgetUnitIds && (!budgetUnitId || !actor.allowedBudgetUnitIds.includes(budgetUnitId))) throw new Error("Lançamento tributário fora das unidades gestoras autorizadas.");
  const binding = budgetUnitId ? await db.planningEntityUnit.findUnique({ where: { budgetUnitId }, select: { governmentEntityId: true } }) : null;
  if (budgetUnitId && !binding) throw new Error("Unidade gestora arrecadadora sem entidade vinculada.");
  if (typeof stored.governmentEntityId === "string" && stored.governmentEntityId !== binding?.governmentEntityId) throw new Error("A entidade atual da UG diverge do lançamento tributário; concilie o vínculo histórico.");
  return { budgetUnitId, governmentEntityId: binding?.governmentEntityId ?? null };
}

export async function resolveTaxFinancialYear(db: Db, year: number, scope: { governmentEntityId: string | null }, requireOpen = true) {
  const financialYear = await db.financialYear.findFirst({ where: { year, governmentEntityId: scope.governmentEntityId } });
  if (!financialYear) throw new Error(`O exercício financeiro ${year} não está configurado.`);
  if (requireOpen && financialYear.status !== "Aberto") throw new Error(`O exercício financeiro ${year} não está aberto para operação tributária.`);
  return financialYear;
}
