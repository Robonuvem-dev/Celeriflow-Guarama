import { and, asc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { benefitPayrollInputs, leavePayrollInputs } from "../../schema/personnel-payroll-inputs";
import { hrCalculationPolicies, hrPayrollRubricIncidences, hrPayrollRubrics, hrPayrollRules, hrPayrollRuleSets, hrSocialSecurityBands, hrSocialSecuritySchemes } from "../../schema/personnel-configuration";
import { payrollEvents, payrollItems } from "../../schema/personnel-workforce";

export async function listCanonicalPayrollItems(db: DatabaseExecutor, payrollId: string) {
  return db.select({ ...getTableColumns(payrollItems), event: payrollEvents, sstBenefitOrigin: benefitPayrollInputs, sstLeaveOrigin: { id: leavePayrollInputs.id, rubricId: leavePayrollInputs.rubricId, functionalPeriodId: leavePayrollInputs.functionalPeriodId } }).from(payrollItems).innerJoin(payrollEvents, eq(payrollEvents.id, payrollItems.eventId)).leftJoin(benefitPayrollInputs, eq(benefitPayrollInputs.payrollItemId, payrollItems.id)).leftJoin(leavePayrollInputs, eq(leavePayrollInputs.payrollItemId, payrollItems.id)).where(eq(payrollItems.payrollId, payrollId)).orderBy(asc(payrollItems.id));
}
export async function requirePayrollCalculationRules(db: DatabaseExecutor, id: string) {
  const [set] = await db.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.id, id)).limit(1);
  if (!set) throw new Error("Conjunto de regras não encontrado.");
  const [policies, rules, rubrics] = await Promise.all([
    db.select().from(hrCalculationPolicies).where(eq(hrCalculationPolicies.ruleSetId, id)).limit(1),
    db.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.ruleSetId, id), eq(hrPayrollRules.isActive, true))),
    db.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, id), eq(hrPayrollRubrics.isActive, true))).orderBy(asc(hrPayrollRubrics.priority), asc(hrPayrollRubrics.code)),
  ]);
  const incidences = rubrics.length ? await db.select().from(hrPayrollRubricIncidences).where(inArray(hrPayrollRubricIncidences.rubricId, rubrics.map(row => row.id))) : [];
  return { ...set, calculationPolicy: policies[0] ?? null, rules, rubrics: rubrics.map(row => ({ ...row, incidences: incidences.filter(incidence => incidence.rubricId === row.id) })) };
}
export async function listSocialSecuritySchemes(db: DatabaseExecutor, ids: string[]) {
  const schemes = await db.select().from(hrSocialSecuritySchemes).where(inArray(hrSocialSecuritySchemes.id, ids));
  const bands = await db.select().from(hrSocialSecurityBands).where(inArray(hrSocialSecurityBands.socialSecuritySchemeId, ids)).orderBy(asc(hrSocialSecurityBands.sequence));
  return schemes.map(row => ({ ...row, bands: bands.filter(band => band.socialSecuritySchemeId === row.id) }));
}
