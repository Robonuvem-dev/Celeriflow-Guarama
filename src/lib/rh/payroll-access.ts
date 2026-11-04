import { assertBudgetUnitAccess, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { payrolls } from "@/db/schema/personnel-workforce";
import { personnelDepartmentWhere, personnelRubricWhere } from "./personnel-scope";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import type { DatabaseExecutor } from "@/db/transaction";

/** SQL predicate over the canonical Payroll mapping; include payrolls in the query. */
export function accessiblePayrollWhere(user: AppContext["user"]): SQL {
  if (isSystemAdministrator(user)) return sql`true`;
  return sql`(NOT EXISTS (SELECT 1 FROM "SstBenefitPayrollScope" s WHERE s."payrollId"=${payrolls.id} AND NOT coalesce(s."budgetUnitId"=ANY(${sql.param(user.allowedBudgetUnitIds)}::text[]),false))
    AND NOT EXISTS (SELECT 1 FROM "PayrollItem" scoped_source LEFT JOIN "Employee" scoped_holder ON scoped_holder.id=scoped_source."employeeId" LEFT JOIN "PayrollEvent" scoped_event ON scoped_event.id=scoped_source."eventId"
      WHERE scoped_source."payrollId"=${payrolls.id} AND (scoped_holder.id IS NULL OR scoped_event.id IS NULL
        OR NOT (${personnelBudgetEmployeeWhere(sql`scoped_holder.id`, user.allowedBudgetUnitIds)})
        OR NOT coalesce(${personnelDepartmentWhere(user, sql`scoped_holder."departmentId"`)},false)
        OR NOT (${personnelRubricWhere(user, sql`scoped_event.code`)})))
    AND NOT EXISTS (SELECT 1 FROM "HrPayrollStatement" scoped_statement JOIN "HrPayrollRun" scoped_run ON scoped_run.id=scoped_statement."runId"
      JOIN "HrEmploymentContract" scoped_contract ON scoped_contract.id=scoped_statement."contractId" JOIN "Employee" scoped_employee ON scoped_employee.id=scoped_contract."employeeId"
      WHERE scoped_run."payrollId"=${payrolls.id} AND (
        NOT (${personnelBudgetEmployeeWhere(sql`scoped_employee.id`, user.allowedBudgetUnitIds)})
        OR NOT coalesce(${personnelDepartmentWhere(user, sql`scoped_statement.snapshot->'contract'->>'departmentId'`)},false)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(scoped_statement.snapshot->'items') scoped_item WHERE (scoped_item->>'value')::numeric<>0 AND NOT (${personnelRubricWhere(user, sql`scoped_item->>'code'`)}))
      )))`;
}

export async function assertPayrollBudgetScope(context: Omit<AppContext, "database"> & { database?: DatabaseExecutor }, payrollId: string) {
  const { rows: [scope] } = await (context.database ?? db).execute<{ budgetUnitId: string }>(sql`SELECT "budgetUnitId" FROM "SstBenefitPayrollScope" WHERE "payrollId"=${payrollId}`);
  if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
  const [permitted] = await (context.database ?? db).select({ id: payrolls.id }).from(payrolls).where(sql`${payrolls.id}=${payrollId} AND ${accessiblePayrollWhere(context.user)}`).limit(1);
  if (!permitted) throw new Error("Folha inexistente ou fora do escopo de unidades, lotações ou eventos de RH.");
}
