import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstBeneficiaries, sstBenefitConfigs, sstHealthPlans, sstPayrollBenefits } from "@/db/schema/sst-benefits";
import { sstBudgetUnits } from "@/db/schema/sst-reference";
import { employees } from "@/db/schema/administration";
import { dependents } from "@/db/schema/personnel-records";
import { hrPayrollRubrics, hrPayrollRuleSets } from "@/db/schema/personnel-configuration";

export async function findSstHealthPlan(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ plan: sstHealthPlans, budgetUnit: sstBudgetUnits, benefitConfig: sstBenefitConfigs }).from(sstHealthPlans).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstHealthPlans.budgetUnitId)).innerJoin(sstBenefitConfigs, eq(sstBenefitConfigs.id, sstHealthPlans.benefitConfigId)).where(eq(sstHealthPlans.id, id));
  return row ? { ...row.plan, budgetUnit: row.budgetUnit, benefitConfig: row.benefitConfig } : null;
}
export async function findSstBenefitBeneficiary(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ beneficiary: sstBeneficiaries, payrollBenefit: sstPayrollBenefits, employee: employees, dependent: dependents }).from(sstBeneficiaries).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).innerJoin(employees, eq(employees.id, sstPayrollBenefits.employeeId)).leftJoin(dependents, eq(dependents.id, sstBeneficiaries.dependentId)).where(eq(sstBeneficiaries.id, id));
  if (!row) return null;
  const plan = await findSstHealthPlan(database, row.beneficiary.planId);
  return plan ? { ...row.beneficiary, plan, payrollBenefit: { ...row.payrollBenefit, employee: row.employee }, dependent: row.dependent } : null;
}
export async function findSstBenefitRubric(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ rubric: hrPayrollRubrics, ruleSet: hrPayrollRuleSets }).from(hrPayrollRubrics).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRubrics.ruleSetId)).where(eq(hrPayrollRubrics.id, id));
  return row ? { ...row.rubric, ruleSet: row.ruleSet } : null;
}
