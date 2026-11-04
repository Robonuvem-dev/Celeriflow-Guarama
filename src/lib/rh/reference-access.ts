import { sql, type SQLWrapper } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "@/lib/contracts/identity";
import { assertBudgetUnitAccess, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import { assertPersonnelDepartment, assertPersonnelRubrics, personnelDepartmentWhere, personnelEmployeeWhere, personnelRubricWhere } from "./personnel-scope";

/** General reference names remain available; holder-bound records require every explicit scope. */
export function personnelReferenceWhere(user: PermissionUser, details: SQLWrapper) {
  if (isSystemAdministrator(user)) return sql`true`;
  return sql`((coalesce(${details}->>'employeeId','')='' OR EXISTS(SELECT 1 FROM "Employee" reference_holder WHERE reference_holder.id=${details}->>'employeeId' AND ${personnelEmployeeWhere(user, sql`reference_holder."departmentId"`, sql`reference_holder.id`)}))
    AND (coalesce(${details}->>'contractId','')='' OR EXISTS(SELECT 1 FROM "HrEmploymentContract" reference_contract JOIN "Employee" reference_holder ON reference_holder.id=reference_contract."employeeId" WHERE reference_contract.id=${details}->>'contractId' AND ${personnelDepartmentWhere(user, sql`reference_contract."departmentId"`)} AND ${personnelEmployeeWhere(user, sql`reference_holder."departmentId"`, sql`reference_holder.id`)}))
    AND (coalesce(${details}->>'departmentId','')='' OR ${personnelDepartmentWhere(user, sql`${details}->>'departmentId'`)})
    AND (coalesce(${details}->>'rubricCode','')='' OR ${personnelRubricWhere(user, sql`${details}->>'rubricCode'`)})
    AND (coalesce(${details}->>'appropriationId','')='' OR EXISTS(SELECT 1 FROM "BudgetAppropriation" reference_budget WHERE reference_budget.id=${details}->>'appropriationId' ${user.allowedBudgetUnitIds === undefined ? sql`` : sql`AND reference_budget."budgetUnitId"=ANY(${sql.param(user.allowedBudgetUnitIds)}::text[])`})))`;
}

export async function assertPersonnelReferenceAccess(db: DatabaseExecutor, context: AppContext, details: Record<string, string>) {
  let targeted = false;
  if (details.employeeId) { await assertFunctionalHolderAccess(db, context, details.employeeId); targeted = true; }
  if (details.contractId) {
    const [contract] = (await db.execute<{ employeeId: string; departmentId: string | null }>(sql`SELECT "employeeId","departmentId" FROM "HrEmploymentContract" WHERE id=${details.contractId}`)).rows;
    if (!contract) throw new Error("Contrato da referência não encontrado.");
    await assertFunctionalHolderAccess(db, context, contract.employeeId); assertPersonnelDepartment(context.user, contract.departmentId); targeted = true;
  }
  if (details.departmentId) { assertPersonnelDepartment(context.user, details.departmentId); targeted = true; }
  if (details.appropriationId) {
    const [appropriation] = (await db.execute<{ budgetUnitId: string }>(sql`SELECT "budgetUnitId" FROM "BudgetAppropriation" WHERE id=${details.appropriationId}`)).rows;
    if (!appropriation) throw new Error("Dotação da referência não encontrada.");
    assertBudgetUnitAccess(context.user, appropriation.budgetUnitId);
  }
  if (details.rubricCode) assertPersonnelRubrics(context.user, [details.rubricCode]);
  if (!targeted) await assertFunctionalHolderAccess(db, context, null);
}
