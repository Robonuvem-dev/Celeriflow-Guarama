import { and, asc, desc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxes, taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { pageBenefitRules, pagePayments } from "@/db/schema/taxation-pages";
import { listPageTaxpayers } from "./registry";
import type { AssessmentDetails, BenefitRuleRow, GuideDetails, TaxRow } from "@/lib/contracts/taxation-pages";

export function pageAssessmentScope(allowedBudgetUnitIds?: string[]): SQL {
  return allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`${taxAssessments.calculationSnapshot}->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
}
export async function isPageAssessmentVisible(database: DatabaseExecutor, id: string, allowedBudgetUnitIds?: string[]): Promise<boolean> {
  return (await database.select({ id: taxAssessments.id }).from(taxAssessments).where(and(eq(taxAssessments.id, id), pageAssessmentScope(allowedBudgetUnitIds))).limit(1)).length > 0;
}
export async function listPageTaxes(database: DatabaseExecutor): Promise<TaxRow[]> {
  return database.select().from(taxes).where(eq(taxes.isActive, true)).orderBy(asc(taxes.name));
}
export async function listPageAssessments(database: DatabaseExecutor, selection: { allowedBudgetUnitIds?: string[]; ids?: string[]; statuses?: string[]; calendar?: boolean; limit?: number } = {}): Promise<AssessmentDetails[]> {
  const query = database.select({ assessment: taxAssessments, tax: taxes }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId))
    .where(and(pageAssessmentScope(selection.allowedBudgetUnitIds), selection.ids ? inArray(taxAssessments.id, selection.ids) : undefined, selection.statuses ? inArray(taxAssessments.status, selection.statuses) : undefined, selection.calendar ? notInArray(taxAssessments.status, ["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"]) : undefined)).$dynamic();
  if (selection.calendar) query.orderBy(desc(taxAssessments.year), desc(taxAssessments.createdAt)); else query.orderBy(desc(taxAssessments.createdAt));
  if (selection.limit !== undefined) query.limit(selection.limit);
  const rows = await query;
  const [taxpayers, guides] = await Promise.all([
    listPageTaxpayers(database, { ids: rows.map(row => row.assessment.taxpayerId) }),
    database.select().from(taxGuides).where(and(inArray(taxGuides.assessmentId, rows.map(row => row.assessment.id)), selection.calendar ? sql`${taxGuides.status} <> 'Cancelada'` : undefined)),
  ]);
  const payments = await database.select().from(pagePayments).where(and(inArray(pagePayments.guideId, guides.map(row => row.id)), eq(pagePayments.status, "Confirmado")));
  return rows.map(row => {
    const taxpayer = taxpayers.find(taxpayer => taxpayer.id === row.assessment.taxpayerId);
    if (!taxpayer) throw new Error("Contribuinte fiscal não encontrado.");
    return { ...row.assessment, tax: row.tax, taxpayer, guides: guides.filter(guide => guide.assessmentId === row.assessment.id).map(guide => ({ ...guide, payments: payments.filter(payment => payment.guideId === guide.id) })) };
  });
}
export async function listPageGuides(database: DatabaseExecutor, allowedBudgetUnitIds?: string[], limit?: number): Promise<GuideDetails[]> {
  const query = database.select({ guide: taxGuides, assessment: taxAssessments, tax: taxes }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).where(pageAssessmentScope(allowedBudgetUnitIds)).orderBy(desc(taxGuides.createdAt)).$dynamic();
  if (limit !== undefined) query.limit(limit);
  const rows = await query;
  const [taxpayers, payments] = await Promise.all([listPageTaxpayers(database, { ids: rows.map(row => row.assessment.taxpayerId) }), database.select().from(pagePayments).where(and(inArray(pagePayments.guideId, rows.map(row => row.guide.id)), eq(pagePayments.status, "Confirmado")))]);
  return rows.map(row => {
    const taxpayer = taxpayers.find(taxpayer => taxpayer.id === row.assessment.taxpayerId);
    if (!taxpayer) throw new Error("Contribuinte fiscal não encontrado.");
    return { ...row.guide, assessment: { ...row.assessment, tax: row.tax, taxpayer }, payments: payments.filter(payment => payment.guideId === row.guide.id) };
  });
}
export async function listPageBenefitRules(database: DatabaseExecutor, at?: Date): Promise<BenefitRuleRow[]> {
  return database.select().from(pageBenefitRules).where(and(eq(pageBenefitRules.active, true), at ? sql`${pageBenefitRules.effectiveFrom} <= ${at} AND (${pageBenefitRules.effectiveUntil} IS NULL OR ${pageBenefitRules.effectiveUntil} >= ${at})` : undefined)).orderBy(asc(pageBenefitRules.code));
}
