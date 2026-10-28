import { assertBudgetUnitAccess, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { payrolls } from "@/db/schema/personnel-workforce";

/** SQL predicate over the canonical Payroll mapping; include payrolls in the query. */
export function accessiblePayrollWhere(user: AppContext["user"]): SQL {
  if (isSystemAdministrator(user)) return sql`true`;
  return sql`(NOT EXISTS (SELECT 1 FROM "SstBenefitPayrollScope" s WHERE s."payrollId"=${payrolls.id}) OR EXISTS (SELECT 1 FROM "SstBenefitPayrollScope" s WHERE s."payrollId"=${payrolls.id} AND s."budgetUnitId"=ANY(${sql.param(user.allowedBudgetUnitIds)}::text[])))`;
}

export async function assertPayrollBudgetScope(context: AppContext, payrollId: string) {
  const { rows: [scope] } = await (context.database ?? db).execute<{ budgetUnitId: string }>(sql`SELECT "budgetUnitId" FROM "SstBenefitPayrollScope" WHERE "payrollId"=${payrollId}`);
  if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
}
