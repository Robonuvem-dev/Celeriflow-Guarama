import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstBenefitConfigs, sstHealthPlans, sstPayrollBenefits } from "@/db/schema/sst-benefits";
import { employees } from "@/db/schema/administration";
import { dependents } from "@/db/schema/personnel-records";
import { hrPayrollRubrics, hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import type { SstPageOption, SstPageUnit, SstPlanRegistrationPageDto } from "@/lib/contracts/sst-pages";

export async function readSstBenefitRegistrationPage(database: DatabaseExecutor, units: SstPageUnit[], q: string, params: { planId?: string; payrollBenefitId?: string }): Promise<{
  plans: SstPlanRegistrationPageDto[]; configs: (SstPageOption & { type: string })[];
  rubrics: (SstPageOption & { code: string; ruleSet: { name: string } })[];
  assignments: { id: string; employee: SstPageOption & { dependents: (SstPageOption & { employeeId: string })[] }; benefitConfig: { name: string } }[];
}> {
  const plans = await database.select({ plan: sstHealthPlans, benefitConfig: sstBenefitConfigs }).from(sstHealthPlans).innerJoin(sstBenefitConfigs, eq(sstBenefitConfigs.id, sstHealthPlans.benefitConfigId)).where(and(inArray(sstHealthPlans.budgetUnitId, units.map(unit => unit.id)), params.planId ? eq(sstHealthPlans.id, params.planId) : q.length >= 3 ? ilike(sstBenefitConfigs.name, `%${q}%`) : eq(sstHealthPlans.id, "NO_SEARCH"))).orderBy(desc(sstHealthPlans.createdAt), asc(sstHealthPlans.id)).limit(20).then(rows => rows.map(row => ({ ...row.plan, benefitConfig: row.benefitConfig })));
  const configs = q.length >= 3 ? await database.select({ id: sstBenefitConfigs.id, name: sstBenefitConfigs.name, type: sstBenefitConfigs.type }).from(sstBenefitConfigs).where(and(eq(sstBenefitConfigs.isActive, true), ilike(sstBenefitConfigs.name, `%${q}%`), sql`NOT EXISTS(SELECT 1 FROM ${sstHealthPlans} WHERE ${sstHealthPlans.benefitConfigId}=${sstBenefitConfigs.id})`)).orderBy(asc(sstBenefitConfigs.name), asc(sstBenefitConfigs.id)).limit(20) : [];
  const rubrics = q.length >= 3 ? await database.select({ id: hrPayrollRubrics.id, code: hrPayrollRubrics.code, name: hrPayrollRubrics.name, ruleSet: { name: hrPayrollRuleSets.name } }).from(hrPayrollRubrics).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRubrics.ruleSetId)).where(and(eq(hrPayrollRubrics.isActive, true), eq(hrPayrollRubrics.type, "DESCONTO"), or(ilike(hrPayrollRubrics.name, `%${q}%`), ilike(hrPayrollRubrics.code, `%${q}%`)))).orderBy(asc(hrPayrollRubrics.code), asc(hrPayrollRubrics.id)).limit(20) : [];
  const assignmentRows = await database.select({ id: sstPayrollBenefits.id, employee: { id: employees.id, name: employees.name }, benefitConfig: { name: sstBenefitConfigs.name } }).from(sstPayrollBenefits).innerJoin(employees, eq(employees.id, sstPayrollBenefits.employeeId)).innerJoin(sstBenefitConfigs, eq(sstBenefitConfigs.id, sstPayrollBenefits.benefitConfigId)).where(and(eq(sstPayrollBenefits.status, "Ativo"), eq(employees.isActive, true), inArray(employees.secretariatId, units.map(unit => unit.secretariatId)), params.payrollBenefitId ? eq(sstPayrollBenefits.id, params.payrollBenefitId) : q.length >= 3 ? ilike(employees.name, `%${q}%`) : eq(sstPayrollBenefits.id, "NO_SEARCH"))).orderBy(asc(sstPayrollBenefits.id)).limit(20);
  const dependentRows = assignmentRows.length ? await database.select({ id: dependents.id, name: dependents.name, employeeId: dependents.employeeId }).from(dependents).where(inArray(dependents.employeeId, assignmentRows.map(row => row.employee.id))) : [];
  const assignments = assignmentRows.map(row => ({ ...row, employee: { ...row.employee, dependents: dependentRows.filter(dependent => dependent.employeeId === row.employee.id) } }));
  return { plans, configs, rubrics, assignments };
}
