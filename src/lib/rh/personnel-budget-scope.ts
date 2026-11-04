import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** Employee.unitId is AdministrativeUnit; budget access uses explicit appropriation links. */
export function personnelBudgetEmployeeWhere(employeeId: SQLWrapper, budgetUnitIds?: readonly string[]): SQL {
  if (budgetUnitIds === undefined) return sql`true`;
  return sql`EXISTS (
    SELECT 1 FROM "HrReferenceRecord" personnel_budget_link
    JOIN "BudgetAppropriation" personnel_appropriation ON personnel_appropriation.id=personnel_budget_link.details->>'appropriationId'
    WHERE personnel_appropriation."budgetUnitId"=ANY(${sql.param(budgetUnitIds)}::text[])
      AND ((personnel_budget_link.kind='LOTACAO_ORCAMENTARIA' AND personnel_budget_link.details->>'employeeId'=${employeeId})
        OR (personnel_budget_link.kind='RATEIO_FOLHA' AND EXISTS(SELECT 1 FROM "HrEmploymentContract" personnel_budget_contract WHERE personnel_budget_contract.id=personnel_budget_link.details->>'contractId' AND personnel_budget_contract."employeeId"=${employeeId})))
  )`;
}
